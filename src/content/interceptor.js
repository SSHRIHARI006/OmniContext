/**
 * OmniContext Network Model Interceptor (MAIN WORLD)
 * Injected into the page's main world via content_scripts "world": "MAIN"
 * on Chromium, or dynamically via <script> injection on Firefox (which does
 * not support "world": "MAIN"). Monkey-patches window.fetch and
 * XMLHttpRequest to read model IDs out of outgoing request bodies and
 * response payloads, then forwards them to the isolated-world content script
 * via window.postMessage.
 *
 * Self-contained: no imports, safe to run in the page's main world.
 */
(function () {
  'use strict';

  if (window.__omniContextIntercepted) return;
  window.__omniContextIntercepted = true;

  const TAG = '[OmniContext Interceptor]';

  function sendDetection(modelId, source) {
    if (!modelId || typeof modelId !== 'string') return;
    try {
      window.postMessage(
        {
          type: 'OMNI_MODEL_DETECTED',
          modelId: modelId.trim(),
          source: source || 'unknown'
        },
        '*'
      );
    } catch (e) {
      /* page may be tearing down; ignore */
    }
  }

  function extractModelFromJson(data) {
    if (!data) return null;
    if (typeof data.model === 'string') return data.model;
    if (typeof data.model_id === 'string') return data.model_id;
    if (data.message && typeof data.message.model === 'string') return data.message.model;
    if (data.metadata && typeof data.metadata.model === 'string') return data.metadata.model;
    if (Array.isArray(data.body) && data.body.length) {
      for (const entry of data.body) {
        const m = extractModelFromJson(entry);
        if (m) return m;
      }
    }
    return null;
  }

  // --- fetch interception ---
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = async function (...args) {
      const [url, options] = args;
      let response;
      try {
        response = await originalFetch.apply(this, args);
      } catch (err) {
        throw err;
      }

      try {
        const urlString = typeof url === 'string' ? url : url instanceof URL ? url.href : '';
        if (options && typeof options.body === 'string') {
          const parsed = JSON.parse(options.body);
          const model = extractModelFromJson(parsed);
          if (model) sendDetection(model, 'fetch_request');
        }
        if (response && typeof response.clone === 'function') {
          const cloned = response.clone();
          const data = await cloned.json().catch(() => null);
          const model = extractModelFromJson(data);
          if (model) sendDetection(model, 'fetch_response');
        }
      } catch (e) {
        /* non-JSON body/response or read failure — ignore */
      }

      return response;
    };
  }

  // --- XHR interception ---
  const XHR = window.XMLHttpRequest;
  if (typeof XHR === 'function') {
    const originalOpen = XHR.prototype.open;
    const originalSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url, ...rest) {
      this.__omniUrl = typeof url === 'string' ? url : '';
      return originalOpen.apply(this, [method, url, ...rest]);
    };

    XHR.prototype.send = function (body) {
      try {
        if (typeof body === 'string') {
          const parsed = JSON.parse(body);
          const model = extractModelFromJson(parsed);
          if (model) sendDetection(model, 'xhr_request');
        }
      } catch (e) {
        /* non-JSON body — ignore */
      }

      this.addEventListener('load', function () {
        try {
          const data = JSON.parse(this.responseText);
          const model = extractModelFromJson(data);
          if (model) sendDetection(model, 'xhr_response');
        } catch (e) {
          /* non-JSON response — ignore */
        }
      });

      return originalSend.apply(this, [body]);
    };
  }
})();
