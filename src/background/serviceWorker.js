/**
 * OmniContext Background Service Worker (Cross-Browser Manifest V3: Chrome, Firefox, Edge, Brave, Safari)
 * Manages extension state, badge updates, and tab communications.
 */

// Cross-browser API wrapper (Firefox 'browser' or Chrome 'chrome')
const extApi = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);

if (extApi && extApi.runtime) {
  extApi.runtime.onInstalled.addListener(() => {
    console.log('[OmniContext] Extension installed successfully (Firefox & Chrome Compatible).');
    setExtensionBadge('OMNI', '#38bdf8');
  });

  // Listen for messages from content script or popup
  extApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'OMNI_METRICS_UPDATE') {
      const { metrics, platformKey } = message;
      
      // Update Extension Badge
      updateBadge(metrics);

      // Save to storage
      if (extApi.storage && extApi.storage.local) {
        const payload = {
          metrics,
          platformKey,
          url: message.url,
          timestamp: Date.now()
        };

        if (sender && sender.tab && sender.tab.id) {
          const tabKey = `tab_metrics_${sender.tab.id}`;
          extApi.storage.local.set({ [tabKey]: payload, activeMetrics: payload });
        } else {
          extApi.storage.local.set({ activeMetrics: payload });
        }
      }

      sendResponse({ status: 'received' });
    }

    return true; // Keep async response channel open
  });
}

/**
 * Updates action badge text and background color based on metrics.
 * @param {Object} metrics 
 */
function updateBadge(metrics) {
  if (!metrics) return;

  const score = metrics.bloatScore;
  let color = '#4ade80'; // Optimal
  if (score >= 75) {
    color = '#ef4444'; // Bloated (Red)
  } else if (score >= 50) {
    color = '#eab308'; // Dense (Yellow)
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
  const actionApi = extApi?.action || extApi?.browserAction;
  if (actionApi) {
    if (actionApi.setBadgeBackgroundColor) {
      actionApi.setBadgeBackgroundColor({ color });
    }
    if (actionApi.setBadgeText) {
      actionApi.setBadgeText({ text });
    }
  }
}
