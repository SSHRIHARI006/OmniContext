/**
 * OmniContext Background Service Worker (Cross-Browser Manifest V3: Chrome, Firefox, Edge, Brave)
 * Manages extension state, badge updates, and tab communications.
 * Uses the native browser/chrome extension API namespace.
 */

const browser = globalThis.browser || globalThis.chrome;

browser.runtime.onInstalled.addListener(() => {
  console.log('[OmniContext] Extension installed successfully (cross-browser).');
  setExtensionBadge('OMNI', '#38bdf8');
});

/**
 * Accepts messages only from this extension's own content scripts and pages.
 * @param {Object} sender
 * @returns {boolean}
 */
function isTrustedSender(sender) {
  return !!sender && sender.id === browser.runtime.id;
}

// Listen for messages from content script or popup
browser.runtime.onMessage.addListener((message, sender) => {
  if (!isTrustedSender(sender)) return false;

  if (message && message.type === 'OMNI_METRICS_UPDATE') {
    const { metrics, platformKey } = message;

    // Update Extension Badge
    updateBadge(metrics);

    // Save to storage
    const payload = {
      metrics,
      platformKey,
      url: message.url,
      timestamp: Date.now()
    };

    if (sender && sender.tab && sender.tab.id) {
      const tabKey = `tab_metrics_${sender.tab.id}`;
      browser.storage.local.set({ [tabKey]: payload, activeMetrics: payload });
    } else {
      browser.storage.local.set({ activeMetrics: payload });
    }
  }

  return true; // Keep async response channel open
});

/**
 * Updates action badge text and background color based on metrics.
 * @param {Object} metrics
 */
function updateBadge(metrics) {
  if (!metrics) return;

  const score = metrics.healthScore !== undefined ? metrics.healthScore : metrics.bloatScore;
  let color = '#4ade80'; // Optimal (green)
  if (score >= 85) {
    color = '#ef4444'; // Bloated (red)
  } else if (score >= 65) {
    color = '#f97316'; // Degrading (orange)
  } else if (score >= 40) {
    color = '#eab308'; // Dense (yellow)
  }

  let text = '';
  if (metrics.totalTokens >= 1000) {
    text = `${(metrics.totalTokens / 1000).toFixed(1)}k`;
  } else {
    text = `${metrics.totalTokens}`;
  }

  setExtensionBadge(text, color);
}

function setExtensionBadge(text, color) {
  const actionApi = browser.action || browser.browserAction;
  if (actionApi) {
    if (actionApi.setBadgeBackgroundColor) {
      actionApi.setBadgeBackgroundColor({ color });
    }
    if (actionApi.setBadgeText) {
      actionApi.setBadgeText({ text });
    }
  }
}
