/**
 * OmniContext Popup Script
 * Clean, minimal, professional cross-browser implementation with ON/OFF Toggle
 * Switch, Storage Sync, and the SPEC-1 combined Health / Bloat / Rot display.
 */

const OMNI_CAPACITY_BACKGROUNDS = {
  high: 'var(--color-bloated)',
  medium: 'var(--color-dense)',
  low: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-indigo))'
};

const OMNI_STATUS_DESCRIPTIONS = {
  bloated: 'Critical context saturation. Migration strongly recommended.',
  degrading: 'Significant rot detected; consider summarizing.',
  dense: 'Moderate redundancy or attention dilution risk.',
  optimal: 'Optimal context retention and response speed.'
};

const OMNI_STATUS_TITLES = {
  bloated: 'Bloated',
  degrading: 'Degrading',
  dense: 'Dense',
  optimal: 'Optimal'
};

const OMNI_MIGRATE_BUTTON_STYLES = {
  bloated: { background: 'linear-gradient(135deg, #dc2626, #991b1b)', label: 'Context Bloated: Inject Summary Prompt' },
  degrading: { background: 'linear-gradient(135deg, #ea580c, #9a3412)', label: 'Context Degrading: Prepare Summary' },
  normal: { background: 'linear-gradient(135deg, #0284c7, #4f46e5)', label: 'Prepare Context Summary' }
};

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

    const debugToggle = document.getElementById('debugToggle');
    debugToggle.addEventListener('change', (event) => this.handleDebugToggle(event.target.checked));
    this.loadDebugState();

    document.getElementById('simSelect').addEventListener('change', (e) => {
      if (e.target.value !== 'auto') {
        this.runSimulation(e.target.value);
      } else {
        this.fetchMetricsFromActiveTab();
      }
    });
  }

  async loadToggleState() {
    this.isEnabled = await OmniContext.BrowserApi.getStoredValue('extensionEnabled', true);
    this.updateToggleUI(this.isEnabled);
  }

  async loadDebugState() {
    const debugEnabled = await OmniContext.BrowserApi.getStoredValue('debugEnabled', false);
    document.getElementById('debugToggle').checked = debugEnabled === true;
  }

  async handleDebugToggle(enabled) {
    const stored = await OmniContext.BrowserApi.setStoredValues({ debugEnabled: enabled });
    if (!stored) {
      this.showToast('Could not update debug logging');
      return;
    }

    await OmniContext.BrowserApi.sendMessageToActiveTab({ action: 'SET_DEBUG_STATE', enabled: !!enabled });
    this.showToast(enabled ? 'Debug logging enabled' : 'Debug logging disabled');
  }

  async handleToggleChange(enabled) {
    this.isEnabled = enabled;
    this.updateToggleUI(enabled);

    await OmniContext.BrowserApi.setStoredValues({ extensionEnabled: enabled });
    await OmniContext.BrowserApi.sendMessageToActiveTab({ action: 'SET_EXTENSION_STATE', enabled });

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

    const { response } = await OmniContext.BrowserApi.sendMessageToActiveTab({ action: 'GET_METRICS' });
    if (response && response.metrics) {
      this.setDataMode('live');
      this.updateUI(response.metrics, response.platformKey, response.modelName);
      return;
    }

    // Fallback to storage
    this.fetchFromStorage();
  }

  async fetchFromStorage() {
    const activeMetrics = await OmniContext.BrowserApi.getStoredValue('activeMetrics', null);
    if (activeMetrics && activeMetrics.metrics) {
      this.setDataMode('live');
      this.updateUI(activeMetrics.metrics, activeMetrics.platformKey, activeMetrics.modelName);
      return;
    }

    this.showToast('No live data — showing simulation');
    this.runSimulation('gemini');
  }

  runSimulation(platformKey = 'gemini') {
    this.setDataMode('simulation');
    const modelInfo = OmniContext.ModelRegistry.getModelInfo(platformKey);

    const mockMessages = [
      { id: '1', role: 'user', text: 'Can you write a complete specification and code architecture for OmniContext extension?' },
      { id: '2', role: 'assistant', text: 'Here is the comprehensive specification:\n```javascript\nfunction analyze() { return true; }\n```\n' + 'Sample text '.repeat(450), codeText: 'function analyze() { return true; }' },
      { id: '3', role: 'user', text: 'Now implement all platform adapters for ChatGPT, Claude, Gemini, DeepSeek, Kimi, Qwen.' },
      { id: '4', role: 'assistant', text: 'I will now implement all platform adapters:\n```javascript\nexport class BaseAdapter {}\nexport class ChatGPTAdapter extends BaseAdapter {}\n```\n' + 'Code implementation detail '.repeat(800), codeText: 'export class BaseAdapter {}\nexport class ChatGPTAdapter extends BaseAdapter {}' },
      { id: '5', role: 'user', text: 'Add real-time context bloat calculation formula and Shadow DOM widget.' },
      { id: '6', role: 'assistant', text: 'Adding bloat formula:\n```typescript\ninterface MetricsPayload { totalTokens: number; bloatScore: number; }\n```\n' + 'Additional details '.repeat(600), codeText: 'interface MetricsPayload { totalTokens: number; bloatScore: number; }' }
    ];

    const metrics = OmniContext.MetricsCalculator.calculateMetrics(mockMessages, {
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
    const { MetricsView } = OmniContext;
    this.activeMetrics = metrics;
    this.platformKey = platformKey;
    this.modelName = modelName || OmniContext.ModelRegistry.getModelInfo(platformKey).name;

    document.getElementById('platformBadge').innerText = `${this.modelName}`;

    // Combined Health Score (max of bloat/rot)
    const healthScore = MetricsView.resolveHealthScore(metrics);
    const bloatVal = document.getElementById('bloatScoreVal');
    bloatVal.innerText = `${healthScore}`;

    const ringFill = document.getElementById('bloatRingFill');
    const circumference = 251.2;
    const offset = circumference * (1 - healthScore / 100);
    ringFill.style.strokeDashoffset = offset;

    const statusPill = document.getElementById('statusPill');
    const statusText = document.getElementById('statusText');
    const statusDesc = document.getElementById('statusDesc');

    const statusLevel = OMNI_STATUS_TITLES[metrics.statusLevel] ? metrics.statusLevel : 'optimal';
    ringFill.style.stroke = `var(--color-${statusLevel})`;
    statusPill.className = `status-pill status-${statusLevel}`;
    statusText.innerText = OMNI_STATUS_TITLES[statusLevel];
    statusDesc.innerText = OMNI_STATUS_DESCRIPTIONS[statusLevel];

    // Bloat / Rot sub-indicators
    const bloatDetail = document.getElementById('bloatDetailVal');
    const rotDetail = document.getElementById('rotDetailVal');
    if (bloatDetail) bloatDetail.innerText = `${metrics.bloatScore}`;
    if (rotDetail) rotDetail.innerText = `${metrics.rotScore}`;

    const tokens = MetricsView.formatTokenCounts(metrics);

    document.getElementById('capacityRatio').innerText = `${metrics.totalTokens.toLocaleString()} / ${tokens.limit}`;
    const capacityFill = document.getElementById('capacityFill');
    capacityFill.style.width = `${metrics.capacityUsed}%`;
    capacityFill.style.background = OMNI_CAPACITY_BACKGROUNDS[MetricsView.capacityTier(metrics.capacityUsed)];

    document.getElementById('capacityPercentText').innerText = `${metrics.capacityUsed}% Capacity Used`;
    document.getElementById('remainingTokensText').innerText = `${tokens.remaining} Free (${tokens.limit} Max)`;

    document.getElementById('metricTotalTokens').innerText = tokens.total;
    document.getElementById('metricTurns').innerText = metrics.turnCount;
    document.getElementById('metricCodeDensity').innerText = `${metrics.codeDensity}%`;
    document.getElementById('metricWords').innerText = metrics.totalWords.toLocaleString();

    document.getElementById('userBar').style.width = `${metrics.userRatio}%`;
    document.getElementById('assistantBar').style.width = `${metrics.assistantRatio}%`;
    document.getElementById('distRatioText').innerText = `${metrics.userRatio}% User / ${metrics.assistantRatio}% Assist`;
    document.getElementById('userTokensVal').innerText = metrics.userTokens.toLocaleString();
    document.getElementById('assistantTokensVal').innerText = metrics.assistantTokens.toLocaleString();

    const healthTier = MetricsView.statusTier(healthScore);
    const migrateStyle = OMNI_MIGRATE_BUTTON_STYLES[healthTier] || OMNI_MIGRATE_BUTTON_STYLES.normal;
    const btnMigrate = document.getElementById('btnMigrate');
    btnMigrate.style.background = migrateStyle.background;
    btnMigrate.innerText = migrateStyle.label;
  }

  async handleMigrate() {
    const { ok } = await OmniContext.BrowserApi.sendMessageToActiveTab({ action: 'PREPARE_SUMMARY' });
    if (ok) {
      this.showToast('Summary prompt injected');
      return;
    }
    this.handleCopyPrompt();
  }

  handleCopyPrompt() {
    const promptText = OmniContext.MigrationPromptEngine.getPromptText();
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
