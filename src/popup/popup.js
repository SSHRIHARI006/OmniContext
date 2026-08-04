/**
 * OmniContext Popup Script
 * Clean, minimal, professional cross-browser implementation with ON/OFF Toggle
 * Switch, Storage Sync, and the SPEC-1 combined Health / Bloat / Rot display.
 */

import browser from 'webextension-polyfill';
import { MetricsCalculator } from '../core/metricsCalculator.js';
import { MigrationPromptEngine } from '../core/migrationPrompt.js';
import { ModelRegistry } from '../core/modelRegistry.js';

class PopupController {
  constructor() {
    this.activeMetrics = null;
    this.platformKey = 'generic';
    this.modelName = '';
    this.isEnabled = true;

    this.init();
  }

  async init() {
    this.bindEvents();
    await this.loadToggleState();
    if (this.isEnabled) {
      await this.fetchMetricsFromActiveTab();
    }
  }

  bindEvents() {
    const extensionToggle = document.getElementById('extensionToggle');
    extensionToggle.addEventListener('change', (e) => this.handleToggleChange(e.target.checked));

    document.getElementById('btnMigrate').addEventListener('click', () => this.handleMigrate());
    document.getElementById('btnCopyPrompt').addEventListener('click', () => this.handleCopyPrompt());
    document.getElementById('btnRescan').addEventListener('click', () => this.handleRescan());

    document.getElementById('simSelect').addEventListener('change', (e) => {
      if (e.target.value !== 'auto') {
        this.runSimulation(e.target.value);
      } else {
        this.fetchMetricsFromActiveTab();
      }
    });
  }

  async loadToggleState() {
    try {
      const res = await browser.storage.local.get('extensionEnabled');
      this.isEnabled = res && res.extensionEnabled !== undefined ? res.extensionEnabled : true;
    } catch (e) {
      this.isEnabled = true;
    }
    this.updateToggleUI(this.isEnabled);
  }

  async handleToggleChange(enabled) {
    this.isEnabled = enabled;
    this.updateToggleUI(enabled);

    try {
      await browser.storage.local.set({ extensionEnabled: enabled });
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0] && tabs[0].id) {
        browser.tabs.sendMessage(tabs[0].id, { action: 'SET_EXTENSION_STATE', enabled });
      }
    } catch (e) {}

    this.showToast(enabled ? 'Monitoring Enabled' : 'Monitoring Disabled');
    if (enabled) {
      this.fetchMetricsFromActiveTab();
    }
  }

  updateToggleUI(enabled) {
    const toggleInput = document.getElementById('extensionToggle');
    const toggleLabel = document.getElementById('toggleLabel');
    const mainDashboard = document.getElementById('popupMain');
    const disabledOverlay = document.getElementById('disabledOverlay');

    toggleInput.checked = enabled;
    toggleLabel.innerText = enabled ? 'ON' : 'OFF';
    toggleLabel.style.color = enabled ? 'var(--color-optimal)' : 'var(--text-muted)';

    if (enabled) {
      mainDashboard.style.display = 'block';
      disabledOverlay.style.display = 'none';
    } else {
      mainDashboard.style.display = 'none';
      disabledOverlay.style.display = 'flex';
    }
  }

  async fetchMetricsFromActiveTab() {
    if (!this.isEnabled) return;

    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs && tabs[0];
      if (activeTab && activeTab.id) {
        const response = await browser.tabs.sendMessage(activeTab.id, { action: 'GET_METRICS' });
        if (response && response.metrics) {
          this.updateUI(response.metrics, response.platformKey, response.modelName);
          return;
        }
      }
    } catch (err) {
      console.debug('[OmniContext Popup] Error fetching active tab metrics:', err);
    }

    // Fallback to storage
    this.fetchFromStorage();
  }

  async fetchFromStorage() {
    try {
      const result = await browser.storage.local.get('activeMetrics');
      if (result && result.activeMetrics && result.activeMetrics.metrics) {
        this.updateUI(result.activeMetrics.metrics, result.activeMetrics.platformKey, result.activeMetrics.modelName);
      } else {
        this.runSimulation('gemini');
      }
    } catch (e) {
      this.runSimulation('gemini');
    }
  }

  runSimulation(platformKey = 'gemini') {
    const modelInfo = ModelRegistry.getModelInfo(platformKey);

    const mockMessages = [
      { id: '1', role: 'user', text: 'Can you write a complete specification and code architecture for OmniContext extension?' },
      { id: '2', role: 'assistant', text: 'Here is the comprehensive specification:\n```javascript\nfunction analyze() { return true; }\n```\n' + 'Sample text '.repeat(450), codeText: 'function analyze() { return true; }' },
      { id: '3', role: 'user', text: 'Now implement all platform adapters for ChatGPT, Claude, Gemini, DeepSeek, Kimi, Qwen.' },
      { id: '4', role: 'assistant', text: 'I will now implement all platform adapters:\n```javascript\nexport class BaseAdapter {}\nexport class ChatGPTAdapter extends BaseAdapter {}\n```\n' + 'Code implementation detail '.repeat(800), codeText: 'export class BaseAdapter {}\nexport class ChatGPTAdapter extends BaseAdapter {}' },
      { id: '5', role: 'user', text: 'Add real-time context bloat calculation formula and Shadow DOM widget.' },
      { id: '6', role: 'assistant', text: 'Adding bloat formula:\n```typescript\ninterface MetricsPayload { totalTokens: number; bloatScore: number; }\n```\n' + 'Additional details '.repeat(600), codeText: 'interface MetricsPayload { totalTokens: number; bloatScore: number; }' }
    ];

    const metrics = MetricsCalculator.calculateMetrics(mockMessages, {
      hardLimitTokens: modelInfo.limit,
      tokenMultiplier: modelInfo.multiplier || 1.0
    });

    this.updateUI(metrics, modelInfo.platform, modelInfo.name);
  }

  updateUI(metrics, platformKey = 'generic', modelName = '') {
    this.activeMetrics = metrics;
    this.platformKey = platformKey;
    this.modelName = modelName || ModelRegistry.getModelInfo(platformKey).name;

    document.getElementById('platformBadge').innerText = `${this.modelName}`;

    // Combined Health Score (max of bloat/rot)
    const healthScore = metrics.healthScore !== undefined ? metrics.healthScore : metrics.bloatScore;
    const bloatVal = document.getElementById('bloatScoreVal');
    bloatVal.innerText = `${healthScore}`;

    const ringFill = document.getElementById('bloatRingFill');
    const circumference = 251.2;
    const offset = circumference * (1 - healthScore / 100);
    ringFill.style.strokeDashoffset = offset;

    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusText');
    const statusDesc = document.getElementById('statusDesc');

    if (metrics.statusLevel === 'bloated') {
      ringFill.style.stroke = 'var(--color-bloated)';
      statusPill.className = 'status-pill status-bloated';
      statusText.innerText = 'Bloated';
      statusDesc.innerText = 'Critical context saturation. Migration strongly recommended.';
    } else if (metrics.statusLevel === 'degrading') {
      ringFill.style.stroke = 'var(--color-degrading)';
      statusPill.className = 'status-pill status-degrading';
      statusText.innerText = 'Degrading';
      statusDesc.innerText = 'Significant rot detected; consider summarizing.';
    } else if (metrics.statusLevel === 'dense') {
      ringFill.style.stroke = 'var(--color-dense)';
      statusPill.className = 'status-pill status-dense';
      statusText.innerText = 'Dense';
      statusDesc.innerText = 'Moderate redundancy or attention dilution risk.';
    } else {
      ringFill.style.stroke = 'var(--color-optimal)';
      statusPill.className = 'status-pill status-optimal';
      statusText.innerText = 'Optimal';
      statusDesc.innerText = 'Optimal context retention and response speed.';
    }

    // Bloat / Rot sub-indicators
    const bloatDetail = document.getElementById('bloatDetailVal');
    const rotDetail = document.getElementById('rotDetailVal');
    if (bloatDetail) bloatDetail.innerText = `${metrics.bloatScore}`;
    if (rotDetail) rotDetail.innerText = `${metrics.rotScore}`;

    const formattedLimit = ModelRegistry.formatTokenCount(metrics.contextLimit || metrics.softLimit);
    const formattedTotal = ModelRegistry.formatTokenCount(metrics.totalTokens);
    const formattedRemaining = ModelRegistry.formatTokenCount(metrics.remainingTokens);

    document.getElementById('capacityRatio').innerText = `${metrics.totalTokens.toLocaleString()} / ${formattedLimit}`;
    const capacityFill = document.getElementById('capacityFill');
    capacityFill.style.width = `${metrics.capacityUsed}%`;
    if (metrics.capacityUsed > 80) {
      capacityFill.style.background = 'var(--color-bloated)';
    } else if (metrics.capacityUsed > 50) {
      capacityFill.style.background = 'var(--color-dense)';
    } else {
      capacityFill.style.background = 'linear-gradient(90deg, var(--accent-cyan), var(--accent-indigo))';
    }

    document.getElementById('capacityPercentText').innerText = `${metrics.capacityUsed}% Capacity Used`;
    document.getElementById('remainingTokensText').innerText = `${formattedRemaining} Free (${formattedLimit} Max)`;

    document.getElementById('metricTotalTokens').innerText = formattedTotal;
    document.getElementById('metricTurns').innerText = metrics.turnCount;
    document.getElementById('metricCodeDensity').innerText = `${metrics.codeDensity}%`;
    document.getElementById('metricWords').innerText = metrics.totalWords.toLocaleString();

    document.getElementById('userBar').style.width = `${metrics.userRatio}%`;
    document.getElementById('assistantBar').style.width = `${metrics.assistantRatio}%`;
    document.getElementById('distRatioText').innerText = `${metrics.userRatio}% User / ${metrics.assistantRatio}% Assist`;
    document.getElementById('userTokensVal').innerText = metrics.userTokens.toLocaleString();
    document.getElementById('assistantTokensVal').innerText = metrics.assistantTokens.toLocaleString();

    const btnMigrate = document.getElementById('btnMigrate');
    if (healthScore >= 85) {
      btnMigrate.style.background = 'linear-gradient(135deg, #dc2626, #991b1b)';
      btnMigrate.innerText = 'Context Bloated: Inject Summary Prompt';
    } else if (healthScore >= 65) {
      btnMigrate.style.background = 'linear-gradient(135deg, #ea580c, #9a3412)';
      btnMigrate.innerText = 'Context Degrading: Prepare Summary';
    } else {
      btnMigrate.style.background = 'linear-gradient(135deg, #0284c7, #4f46e5)';
      btnMigrate.innerText = 'Prepare Context Summary';
    }
  }

  async handleMigrate() {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs && tabs[0];
      if (activeTab && activeTab.id) {
        browser.tabs.sendMessage(activeTab.id, { action: 'PREPARE_SUMMARY' });
        this.showToast('Summary prompt injected');
        return;
      }
    } catch (err) {}
    this.handleCopyPrompt();
  }

  handleCopyPrompt() {
    const promptText = MigrationPromptEngine.getPromptText();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(promptText).then(() => {
        this.showToast('Prompt copied to clipboard');
      }).catch(() => {
        this.showToast('Failed to copy prompt');
      });
    }
  }

  handleRescan() {
    this.showToast('Rescanning active tab...');
    this.fetchMetricsFromActiveTab();
  }

  showToast(message) {
    const toast = document.getElementById('popupToast');
    toast.innerText = message;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 2500);
  }
}

document.addEventListener('DOMContentLoaded', () => new PopupController());
