/**
 * OmniContext Popup Script
 * Clean, minimal, professional cross-browser implementation with ON/OFF Toggle
 * Switch, Storage Sync, and the SPEC-1 combined Health / Bloat / Rot display.
 */

const browser = globalThis.browser || globalThis.chrome;
// Referenced through the namespace object: popup.html loads these files as
// classic scripts sharing one global lexical scope, so top-level aliases would
// redeclare the classes those files already declared.
const omni = globalThis.OmniContext;

/**
 * True when a tabs.sendMessage failure only means "no OmniContext content
 * script in this tab" (the popup was opened on a non-LLM page), as opposed to
 * a real messaging failure that must be surfaced.
 * @param {Error} error
 * @returns {boolean}
 */
function isNoReceiverError(error) {
  const message = (error && error.message) || '';
  return /Receiving end does not exist|Could not establish connection|No matching message handler|message port closed/i.test(message);
}

class PopupController {
  constructor() {
    this.activeMetrics = null;
    this.platformKey = 'generic';
    this.modelName = '';
    this.isEnabled = true;

    this.init().catch((error) => {
      omni.logError('Popup initialization failed', error);
      this.showToast('Popup failed to initialize');
    });
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
    extensionToggle.addEventListener('change', (e) => {
      this.handleToggleChange(e.target.checked).catch((error) => omni.logError('Toggle change failed', error));
    });

    document.getElementById('btnMigrate').addEventListener('click', () => {
      this.handleMigrate().catch((error) => omni.logError('Migrate action failed', error));
    });
    document.getElementById('btnCopyPrompt').addEventListener('click', () => {
      this.handleCopyPrompt().catch((error) => omni.logError('Copy prompt action failed', error));
    });
    document.getElementById('btnRescan').addEventListener('click', () => this.handleRescan());

    const debugToggle = document.getElementById('debugToggle');
    debugToggle.addEventListener('change', (event) => {
      this.handleDebugToggle(event.target.checked).catch((error) => omni.logError('Debug toggle failed', error));
    });
    this.loadDebugState().catch((error) => omni.logWarn('Could not load the debug setting', error));

    document.getElementById('simSelect').addEventListener('change', (e) => {
      if (e.target.value !== 'auto') {
        this.renderMetricsSafely(() => this.runSimulation(e.target.value));
      } else {
        this.fetchMetricsFromActiveTab().catch((error) => omni.logError('Could not refresh metrics', error));
      }
    });
  }

  async loadToggleState() {
    try {
      const res = await browser.storage.local.get('extensionEnabled');
      this.isEnabled = res && res.extensionEnabled !== undefined ? res.extensionEnabled : true;
    } catch (error) {
      this.isEnabled = true;
      omni.logWarn('Could not read the monitoring state, defaulting to enabled', error);
      this.showToast('Could not read saved settings');
    }
    this.updateToggleUI(this.isEnabled);
  }

  async loadDebugState() {
    try {
      const result = await browser.storage.local.get('debugEnabled');
      document.getElementById('debugToggle').checked = result?.debugEnabled === true;
    } catch (error) {
      document.getElementById('debugToggle').checked = false;
      omni.logWarn('Could not read the debug setting, defaulting to off', error);
    }
  }

  async handleDebugToggle(enabled) {
    try {
      await browser.storage.local.set({ debugEnabled: enabled });
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs?.[0]?.id) {
        try {
          await browser.tabs.sendMessage(tabs[0].id, { action: 'SET_DEBUG_STATE', enabled: !!enabled });
        } catch (error) {
          if (!isNoReceiverError(error)) throw error;
          omni.logWarn('No content script in the active tab; debug setting applies on next page load', error);
        }
      }
      this.showToast(enabled ? 'Debug logging enabled' : 'Debug logging disabled');
    } catch (error) {
      omni.logError('Could not update debug logging', error);
      this.showToast('Could not update debug logging');
    }
  }

  async handleToggleChange(enabled) {
    this.isEnabled = enabled;
    this.updateToggleUI(enabled);

    try {
      await browser.storage.local.set({ extensionEnabled: enabled });
    } catch (error) {
      omni.logError('Could not save the monitoring state', error);
      this.showToast('Could not save the monitoring state');
      return;
    }

    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0] && tabs[0].id) {
        await browser.tabs.sendMessage(tabs[0].id, { action: 'SET_EXTENSION_STATE', enabled });
      }
    } catch (error) {
      if (isNoReceiverError(error)) {
        omni.logWarn('No content script in the active tab; the new state applies on next page load', error);
      } else {
        omni.logError('Could not notify the active tab of the new monitoring state', error);
        this.showToast('Saved, but the active tab was not updated');
      }
    }

    this.showToast(enabled ? 'Monitoring Enabled' : 'Monitoring Disabled');
    if (enabled) {
      this.fetchMetricsFromActiveTab().catch((error) => omni.logError('Could not refresh metrics', error));
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
        if (response && response.status === 'error') {
          throw new Error(response.error || 'Content script reported an error');
        }
        if (response && response.metrics) {
          this.setDataMode('live');
          this.renderMetricsSafely(() => this.updateUI(response.metrics, response.platformKey, response.modelName));
          return;
        }
      }
    } catch (error) {
      if (isNoReceiverError(error)) {
        omni.logWarn('No OmniContext content script in the active tab', error);
      } else {
        omni.logError('Could not read metrics from the active tab', error);
        this.showToast('Could not read metrics from this tab');
      }
    }

    // Fallback to storage
    await this.fetchFromStorage();
  }

  async fetchFromStorage() {
    let cached = null;
    try {
      const result = await browser.storage.local.get('activeMetrics');
      cached = result && result.activeMetrics && result.activeMetrics.metrics ? result.activeMetrics : null;
    } catch (error) {
      omni.logError('Could not read cached metrics from local storage', error);
      this.showToast('Could not read cached metrics');
    }

    if (cached) {
      this.setDataMode('live');
      this.renderMetricsSafely(() => this.updateUI(cached.metrics, cached.platformKey, cached.modelName));
      return;
    }

    this.showToast('No live data — showing simulation');
    this.renderMetricsSafely(() => this.runSimulation('gemini'));
  }

  /**
   * Runs a render that depends on externally supplied metrics. Malformed or
   * partial payloads would otherwise throw mid-render and leave the popup
   * showing a half-updated dashboard with no explanation.
   * @param {Function} render
   */
  renderMetricsSafely(render) {
    try {
      render();
    } catch (error) {
      omni.logError('Could not render metrics', error);
      this.showToast('Could not render metrics — see the console');
    }
  }

  runSimulation(platformKey = 'gemini') {
    this.setDataMode('simulation');
    const modelInfo = omni.ModelRegistry.getModelInfo(platformKey);

    const mockMessages = [
      { id: '1', role: 'user', text: 'Can you write a complete specification and code architecture for OmniContext extension?' },
      { id: '2', role: 'assistant', text: 'Here is the comprehensive specification:\n```javascript\nfunction analyze() { return true; }\n```\n' + 'Sample text '.repeat(450), codeText: 'function analyze() { return true; }' },
      { id: '3', role: 'user', text: 'Now implement all platform adapters for ChatGPT, Claude, Gemini, DeepSeek, Kimi, Qwen.' },
      { id: '4', role: 'assistant', text: 'I will now implement all platform adapters:\n```javascript\nexport class BaseAdapter {}\nexport class ChatGPTAdapter extends BaseAdapter {}\n```\n' + 'Code implementation detail '.repeat(800), codeText: 'export class BaseAdapter {}\nexport class ChatGPTAdapter extends BaseAdapter {}' },
      { id: '5', role: 'user', text: 'Add real-time context bloat calculation formula and Shadow DOM widget.' },
      { id: '6', role: 'assistant', text: 'Adding bloat formula:\n```typescript\ninterface MetricsPayload { totalTokens: number; bloatScore: number; }\n```\n' + 'Additional details '.repeat(600), codeText: 'interface MetricsPayload { totalTokens: number; bloatScore: number; }' }
    ];

    const metrics = omni.MetricsCalculator.calculateMetrics(mockMessages, {
      hardLimitTokens: modelInfo.limit,
      tokenMultiplier: modelInfo.multiplier || 1.0
    });

    this.updateUI(metrics, modelInfo.platform, modelInfo.name);
  }

  setDataMode(mode) {
    const badge = document.getElementById('dataModeBadge');
    if (!badge) return;
    const isSimulation = mode === 'simulation';
    badge.innerText = isSimulation ? 'Simulation / No live data' : 'Live data';
    badge.style.display = 'inline-block';
    if (!isSimulation) {
      badge.style.background = 'rgba(74, 222, 128, 0.15)';
      badge.style.color = 'var(--color-optimal)';
      badge.style.borderColor = 'rgba(74, 222, 128, 0.35)';
    }
  }

  updateUI(metrics, platformKey = 'generic', modelName = '') {
    this.activeMetrics = metrics;
    this.platformKey = platformKey;
    this.modelName = modelName || omni.ModelRegistry.getModelInfo(platformKey).name;

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

    const formattedLimit = omni.ModelRegistry.formatTokenCount(metrics.contextLimit || metrics.softLimit);
    const formattedTotal = omni.ModelRegistry.formatTokenCount(metrics.totalTokens);
    const formattedRemaining = omni.ModelRegistry.formatTokenCount(metrics.remainingTokens);

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
        const response = await browser.tabs.sendMessage(activeTab.id, { action: 'PREPARE_SUMMARY' });
        if (response && response.injected) {
          this.showToast('Summary prompt injected');
          return;
        }
        if (response && response.copied) {
          this.showToast('Prompt copied to clipboard');
          return;
        }
        if (response && response.status === 'error') {
          omni.logError('Content script could not prepare the summary prompt', new Error(response.error || 'Unknown error'));
        }
      }
    } catch (error) {
      if (isNoReceiverError(error)) {
        omni.logWarn('No content script in the active tab; copying the prompt instead', error);
      } else {
        omni.logError('Could not ask the active tab to inject the summary prompt', error);
      }
    }
    await this.handleCopyPrompt();
  }

  async handleCopyPrompt() {
    const promptText = omni.MigrationPromptEngine.getPromptText();
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(promptText);
      this.showToast('Prompt copied to clipboard');
    } catch (error) {
      omni.logError('Could not copy the summary prompt to the clipboard', error);
      this.showToast('Failed to copy prompt');
    }
  }

  handleRescan() {
    this.showToast('Rescanning active tab...');
    this.fetchMetricsFromActiveTab().catch((error) => omni.logError('Rescan failed', error));
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
