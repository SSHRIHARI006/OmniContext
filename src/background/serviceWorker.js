/**
 * OmniContext Background Service Worker (Cross-Browser Manifest V3: Chrome, Firefox, Edge, Brave)
 * Manages extension state, badge updates, and tab communications.
 * Uses the native browser/chrome extension API namespace.
 *
 * The worker is loaded on its own (no shared namespace file), so the error
 * reporting helpers are defined locally.
 */

const browser = globalThis.browser || globalThis.chrome;

function logError(scope, error, details = {}) {
  const name = error && error.name ? error.name : 'Error';
  const message = error && error.message ? error.message : String(error);
  console.error(`[OmniContext] ${scope}: ${name}: ${message}`, details);
}

/**
 * Awaits an extension API call that returns either a promise (Firefox,
 * Chrome MV3) or undefined (callback-style), reporting failures instead of
 * leaving an unhandled rejection.
 * @param {string} scope
 * @param {Function} call
 * @param {Object} [details]
 */
function reportFailures(scope, call, details = {}) {
  try {
    const result = call();
    if (result && typeof result.catch === 'function') {
      result.catch((error) => logError(scope, error, details));
    }
  } catch (error) {
    logError(scope, error, details);
  }
}

browser.runtime.onInstalled.addListener(() => {
  console.log('[OmniContext] Extension installed successfully (cross-browser).');
  setExtensionBadge('OMNI', '#38bdf8');
});

// Listen for messages from content script or popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'OMNI_METRICS_UPDATE') {
    // Nothing to do; respond so the sender's promise settles instead of
    // hanging until the message port closes.
    sendResponse({ status: 'ignored' });
    return false;
  }

  try {
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

    const items = { activeMetrics: payload };
    if (sender && sender.tab && sender.tab.id) {
      items[`tab_metrics_${sender.tab.id}`] = payload;
    }
    reportFailures('Could not persist metrics', () => browser.storage.local.set(items), {
      tabId: sender?.tab?.id
    });

    sendResponse({ status: 'ok' });
  } catch (error) {
    logError('Failed to handle a metrics update', error, { platformKey: message.platformKey });
    sendResponse({ status: 'error', error: error?.message || 'Unknown error' });
  }

  return false;
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
  if (!actionApi) {
    logError('Cannot update the badge', new Error('No action/browserAction API available'));
    return;
  }

  if (actionApi.setBadgeBackgroundColor) {
    reportFailures('Could not set the badge color', () => actionApi.setBadgeBackgroundColor({ color }), { color });
  }
  if (actionApi.setBadgeText) {
    reportFailures('Could not set the badge text', () => actionApi.setBadgeText({ text }), { text });
  }
}
