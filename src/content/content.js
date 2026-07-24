/**
 * OmniContext Content Script Orchestrator
 * Detects host platform, scrapes messages, calculates context bloat using ModelRegistry context limits,
 * supports real-time ON/OFF toggle storage sync, and renders Shadow DOM overlay HUD.
 */

import { BaseAdapter } from './adapters/baseAdapter.js';
import { ChatGPTAdapter } from './adapters/chatgptAdapter.js';
import { ClaudeAdapter } from './adapters/claudeAdapter.js';
import { GeminiAdapter } from './adapters/geminiAdapter.js';
import { DeepSeekAdapter } from './adapters/deepseekAdapter.js';
import { KimiAdapter } from './adapters/kimiAdapter.js';
import { QwenAdapter } from './adapters/qwenAdapter.js';
import { GenericAdapter } from './adapters/genericAdapter.js';

import { MetricsCalculator } from '../core/metricsCalculator.js';
import { MigrationPromptEngine } from '../core/migrationPrompt.js';
import { ModelRegistry } from '../core/modelRegistry.js';
import { ShadowContainer } from './ui/shadowContainer.js';

const extApi = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);

export class ContentOrchestrator {
  constructor() {
    this.adapter = null;
    this.shadowUI = null;
    this.debounceTimer = null;
    this.latestMetrics = null;
    this.modelInfo = null;
    this.isEnabled = true;

    this.init();
  }

  async init() {
    this.selectAdapter();
    this.shadowUI = new ShadowContainer(() => this.handlePrepareSummary());
    this.setupMessageListeners();
    this.setupStorageListeners();

    await this.checkEnabledState();
    if (this.isEnabled) {
      this.performScan();
      this.setupMutationObserver();
    }
  }

  async checkEnabledState() {
    return new Promise((resolve) => {
      if (extApi && extApi.storage && extApi.storage.local) {
        const getter = extApi.storage.local.get('extensionEnabled');
        if (getter && typeof getter.then === 'function') {
          getter.then((res) => {
            this.isEnabled = res && res.extensionEnabled !== undefined ? res.extensionEnabled : true;
            this.shadowUI.setVisible(this.isEnabled);
            resolve();
          }).catch(() => {
            this.shadowUI.setVisible(true);
            resolve();
          });
        } else {
          extApi.storage.local.get(['extensionEnabled'], (res) => {
            this.isEnabled = res && res.extensionEnabled !== undefined ? res.extensionEnabled : true;
            this.shadowUI.setVisible(this.isEnabled);
            resolve();
          });
        }
      } else {
        this.shadowUI.setVisible(true);
        resolve();
      }
    });
  }

  selectAdapter() {
    const hostname = window.location.hostname;
    const adapters = [
      new ChatGPTAdapter(),
      new ClaudeAdapter(),
      new GeminiAdapter(),
      new DeepSeekAdapter(),
      new KimiAdapter(),
      new QwenAdapter()
    ];

    for (const ad of adapters) {
      if (ad.matches(hostname)) {
        this.adapter = ad;
        break;
      }
    }

    if (!this.adapter) {
      this.adapter = new GenericAdapter();
    }
  }

  setupMutationObserver() {
    const target = this.adapter.getChatContainer() || document.body;

    const observer = new MutationObserver(() => {
      if (!this.isEnabled) return;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.performScan(), 500);
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  performScan() {
    if (!this.isEnabled) return;

    try {
      const messages = this.adapter.extractMessages();
      this.modelInfo = this.adapter.getModelInfo();

      const metrics = MetricsCalculator.calculateMetrics(messages, {
        softLimitTokens: this.modelInfo.softLimit,
        hardLimitTokens: this.modelInfo.limit,
        tokenMultiplier: this.adapter.tokenMultiplier
      });

      metrics.modelName = this.modelInfo.name;
      this.latestMetrics = metrics;

      this.shadowUI.updateMetrics(metrics, this.adapter.platformKey, this.modelInfo.name);
      this.syncStateToBackground(metrics);
    } catch (err) {
      console.debug('[OmniContext] Content scan error:', err);
    }
  }

  syncStateToBackground(metrics) {
    const payload = {
      type: 'OMNI_METRICS_UPDATE',
      platformKey: this.adapter.platformKey,
      modelName: this.modelInfo ? this.modelInfo.name : 'Default Model',
      url: window.location.href,
      metrics,
      timestamp: Date.now()
    };

    if (extApi && extApi.runtime && extApi.runtime.sendMessage) {
      try {
        extApi.runtime.sendMessage(payload, () => {
          if (extApi.runtime.lastError) {}
        });
      } catch (e) {}
    }

    if (extApi && extApi.storage && extApi.storage.local) {
      extApi.storage.local.set({ activeMetrics: payload });
    }
  }

  handlePrepareSummary() {
    if (!this.isEnabled) return;
    const input = this.adapter.getChatInput() || MigrationPromptEngine.findChatInput();
    const success = MigrationPromptEngine.injectPromptIntoInput(input);

    if (navigator.clipboard) {
      navigator.clipboard.writeText(MigrationPromptEngine.getPromptText()).catch(() => {});
    }

    this.showToast(success ? 'Summary prompt injected into input.' : 'Prompt copied to clipboard.');
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.innerText = message;
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '30px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#0f172a',
      color: '#38bdf8',
      padding: '10px 20px',
      borderRadius: '20px',
      border: '1px solid #38bdf8',
      boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
      zIndex: '2147483647',
      fontSize: '13px',
      fontWeight: '600'
    });

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  setupStorageListeners() {
    if (extApi && extApi.storage && extApi.storage.onChanged) {
      extApi.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.extensionEnabled !== undefined) {
          this.isEnabled = !!changes.extensionEnabled.newValue;
          this.shadowUI.setVisible(this.isEnabled);
          if (this.isEnabled) {
            this.performScan();
          }
        }
      });
    }
  }

  setupMessageListeners() {
    if (extApi && extApi.runtime && extApi.runtime.onMessage) {
      extApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'SET_EXTENSION_STATE') {
          this.isEnabled = !!request.enabled;
          this.shadowUI.setVisible(this.isEnabled);
          if (this.isEnabled) {
            this.performScan();
          }
          sendResponse({ status: 'ok', enabled: this.isEnabled });
        } else if (request.action === 'GET_METRICS') {
          if (this.isEnabled) this.performScan();
          sendResponse({ metrics: this.latestMetrics, platformKey: this.adapter.platformKey, modelName: this.modelInfo ? this.modelInfo.name : 'Default Model', isEnabled: this.isEnabled });
        } else if (request.action === 'PREPARE_SUMMARY') {
          if (this.isEnabled) this.handlePrepareSummary();
          sendResponse({ status: 'ok' });
        } else if (request.action === 'FORCE_RESCAN') {
          if (this.isEnabled) this.performScan();
          sendResponse({ metrics: this.latestMetrics });
        }
        return true;
      });
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ContentOrchestrator());
} else {
  new ContentOrchestrator();
}
