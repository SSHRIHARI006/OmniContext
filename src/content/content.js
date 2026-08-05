/**
 * OmniContext Content Script Orchestrator
 * Detects host platform, scrapes messages, calculates context bloat/rot via
 * the ModelRegistry context limits, supports real-time ON/OFF toggle storage
 * sync, listens for network-intercepted model IDs, and renders the Shadow DOM
 * overlay HUD.
 *
 * The content bundle uses the native browser/chrome API fallback so it can
 * run directly in every generated browser build.
 */

// Referenced through the namespace object: content script files share one
// global lexical scope, so top-level aliases would redeclare the classes the
// earlier files already declared (a SyntaxError that aborts the whole file).
const omni = OmniContext;

const extApi = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);

// Firefox MV3 does not support content_scripts "world": "MAIN", so the
// interceptor is injected dynamically there via a web-accessible script tag.
const IS_FIREFOX = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent || '');

class ContentOrchestrator {
  constructor() {
    this.adapter = null;
    this.shadowUI = null;
    this.debounceTimer = null;
    this.latestMetrics = null;
    this.modelInfo = null;
    this.isEnabled = true;
    this.debugEnabled = false;

    this.init().catch((error) => omni.logError('Content script initialization failed', error));
  }

  async init() {
    this.selectAdapter();
    this.shadowUI = new omni.ShadowContainer(() => this.handlePrepareSummary());
    this.setupMessageListeners();
    this.setupStorageListeners();
    await this.loadDebugState();
    this.setupInterceptorListeners();
    this.setupInterceptorInjection();

    await this.checkEnabledState();
    if (this.isEnabled) {
      this.performScan();
      this.setupMutationObserver();
    }
  }

  async loadDebugState() {
    if (!extApi?.storage?.local) return;
    try {
      const result = await extApi.storage.local.get('debugEnabled');
      this.debugEnabled = result?.debugEnabled === true;
    } catch (error) {
      this.debugEnabled = false;
      omni.logWarn('Could not read debug setting, debug logging stays off', error);
    }
  }

  debugLog(message, details = {}) {
    if (!this.debugEnabled) return;
    console.debug(`[OmniContext] ${message}`, details);
  }

  async checkEnabledState() {
    if (extApi && extApi.storage && extApi.storage.local) {
      try {
        const res = await extApi.storage.local.get('extensionEnabled');
        this.isEnabled = res && res.extensionEnabled !== undefined ? res.extensionEnabled : true;
      } catch (error) {
        this.isEnabled = true;
        omni.logWarn('Could not read enabled state, defaulting to enabled', error);
      }
    } else {
      this.isEnabled = true;
    }
    this.shadowUI.setVisible(this.isEnabled);
  }

  selectAdapter() {
    const hostname = window.location.hostname;
    const adapters = [
      new omni.ChatGPTAdapter(),
      new omni.ClaudeAdapter(),
      new omni.GeminiAdapter(),
      new omni.DeepSeekAdapter(),
      new omni.KimiAdapter(),
      new omni.QwenAdapter()
    ];

    for (const ad of adapters) {
      if (ad.matches(hostname)) {
        this.adapter = ad;
        break;
      }
    }

    if (!this.adapter) {
      this.adapter = new omni.GenericAdapter();
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

  /**
   * Listens for model detections forwarded by the main-world interceptor.
   * Re-detects the model (and re-scans) when a new API model ID arrives.
   * Duplicate model IDs are ignored (IMP-3: streaming produces many identical
   * detections per second).
   */
  setupInterceptorListeners() {
    let lastModelId = null;
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.type !== 'OMNI_MODEL_DETECTED' || !data.modelId) return;
      if (data.modelId === lastModelId) return; // deduplicate
      lastModelId = data.modelId;

      if (this.adapter) {
        this.adapter.setInterceptedModel(data.modelId);
        this.performScan();
      }
    });
  }

  /**
   * On Firefox (no "world": "MAIN"), inject the interceptor via a script tag
   * pointing at the web-accessible resource.
   */
  setupInterceptorInjection() {
    if (!IS_FIREFOX) return;
    try {
      const existing = document.getElementById('omni-interceptor-script');
      if (existing) return;
      const script = document.createElement('script');
      script.id = 'omni-interceptor-script';
      script.src = (extApi || chrome).runtime.getURL('src/content/interceptor.js');
      script.addEventListener('error', () => {
        omni.logWarn('Interceptor script failed to load; model detection falls back to DOM scraping', new Error('script load error'), { src: script.src });
      });
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      omni.logWarn('Could not inject interceptor; model detection falls back to DOM scraping', error);
    }
  }

  performScan() {
    if (!this.isEnabled) return;

    try {
      const messages = this.adapter.extractMessages();
      this.modelInfo = this.adapter.getDetectedModel();
      this.debugLog('Scan complete', {
        adapter: this.adapter.platformKey,
        messageCount: messages.length,
        model: this.modelInfo.name,
        modelSource: this.modelInfo.source
      });

      const metrics = omni.MetricsCalculator.calculateMetrics(messages, {
        hardLimitTokens: this.modelInfo.limit,
        tokenMultiplier: this.modelInfo.multiplier || this.adapter.tokenMultiplier
      });

      metrics.modelName = this.modelInfo.name;
      this.latestMetrics = metrics;

      this.shadowUI.updateMetrics(metrics, this.adapter.platformKey, this.modelInfo.name);
      this.syncStateToBackground(metrics);
    } catch (error) {
      omni.logError('Scan failed; metrics were not updated', error, { adapter: this.adapter?.platformKey });
      this.debugLog('Scan failed', { errorName: error?.name || 'Error' });
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
        const sent = extApi.runtime.sendMessage(payload);
        if (sent && typeof sent.catch === 'function') {
          sent.catch((error) => omni.logWarn('Background did not accept the metrics update', error));
        }
      } catch (error) {
        omni.logWarn('Could not send the metrics update to the background worker', error);
      }
    }

    if (extApi && extApi.storage && extApi.storage.local) {
      try {
        const stored = extApi.storage.local.set({ activeMetrics: payload });
        if (stored && typeof stored.catch === 'function') {
          stored.catch((error) => omni.logWarn('Could not cache metrics in local storage', error));
        }
      } catch (error) {
        omni.logWarn('Could not cache metrics in local storage', error);
      }
    }
  }

  async handlePrepareSummary() {
    if (!this.isEnabled) return { status: 'disabled' };

    let injected = false;
    try {
      const input = this.adapter.getChatInput() || omni.MigrationPromptEngine.findChatInput();
      injected = omni.MigrationPromptEngine.injectPromptIntoInput(input);
    } catch (error) {
      omni.logError('Could not inject the summary prompt into the chat input', error);
    }

    if (injected) {
      this.showToast('Summary prompt injected into input.');
      return { status: 'ok', injected: true, copied: false };
    }

    let copied = false;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(omni.MigrationPromptEngine.getPromptText());
      copied = true;
    } catch (error) {
      omni.logError('Could not copy the summary prompt to the clipboard', error);
    }

    this.showToast(copied
      ? 'Prompt copied to clipboard.'
      : 'Could not inject or copy the prompt — see the console for details.');

    return { status: copied ? 'ok' : 'error', injected: false, copied };
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
        try {
          if (namespace === 'local' && changes.extensionEnabled !== undefined) {
            this.isEnabled = !!changes.extensionEnabled.newValue;
            this.shadowUI.setVisible(this.isEnabled);
            if (this.isEnabled) {
              this.performScan();
            }
          }
        } catch (error) {
          omni.logError('Failed to apply a storage change', error, { namespace });
        }
      });
    }
  }

  setupMessageListeners() {
    if (extApi && extApi.runtime && extApi.runtime.onMessage) {
      extApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const action = request && request.action;
        try {
          if (action === 'SET_DEBUG_STATE') {
            this.debugEnabled = !!request.enabled;
            sendResponse({ status: 'ok', debugEnabled: this.debugEnabled });
          } else if (action === 'SET_EXTENSION_STATE') {
            this.isEnabled = !!request.enabled;
            this.shadowUI.setVisible(this.isEnabled);
            if (this.isEnabled) {
              this.performScan();
            }
            sendResponse({ status: 'ok', enabled: this.isEnabled });
          } else if (action === 'GET_METRICS') {
            if (this.isEnabled) this.performScan();
            sendResponse({ status: 'ok', metrics: this.latestMetrics, platformKey: this.adapter.platformKey, modelName: this.modelInfo ? this.modelInfo.name : 'Default Model', isEnabled: this.isEnabled });
          } else if (action === 'PREPARE_SUMMARY') {
            if (!this.isEnabled) {
              sendResponse({ status: 'disabled' });
            } else {
              // Asynchronous: keep the channel open until the prompt is injected
              // or copied so the popup reports the real outcome.
              this.handlePrepareSummary()
                .then((result) => sendResponse(result))
                .catch((error) => {
                  omni.logError('Preparing the summary prompt failed', error);
                  sendResponse({ status: 'error', error: error?.message || 'Unknown error' });
                });
              return true;
            }
          } else if (action === 'FORCE_RESCAN') {
            if (this.isEnabled) this.performScan();
            sendResponse({ status: 'ok', metrics: this.latestMetrics });
          } else {
            sendResponse({ status: 'error', error: `Unknown action: ${action}` });
          }
        } catch (error) {
          omni.logError('Message handler failed', error, { action });
          sendResponse({ status: 'error', error: error?.message || 'Unknown error' });
        }
        return false;
      });
    }
  }
}

function startOrchestrator() {
  try {
    new ContentOrchestrator();
  } catch (error) {
    omni.logError('Content script could not start', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startOrchestrator);
} else {
  startOrchestrator();
}

omni.ContentOrchestrator = ContentOrchestrator;
