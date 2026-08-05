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
    } catch (error) {
      console.warn(`${TAG} Could not forward the detected model:`, error);
    }
  }

  function isJsonResponse(response) {
    try {
      const contentType = response.headers && response.headers.get ? response.headers.get('content-type') : '';
      return typeof contentType === 'string' && /json/i.test(contentType);
    } catch (error) {
      console.warn(`${TAG} Could not read response headers:`, error);
      return false;
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
      const [, options] = args;
      // Network failures belong to the page: never swallow or wrap them.
      const response = await originalFetch.apply(this, args);

      try {
        if (options && typeof options.body === 'string') {
          const parsed = JSON.parse(options.body);
          const model = extractModelFromJson(parsed);
          if (model) sendDetection(model, 'fetch_request');
        }
        if (response && typeof response.clone === 'function' && isJsonResponse(response)) {
          const cloned = response.clone();
          const data = await cloned.json();
          const model = extractModelFromJson(data);
          if (model) sendDetection(model, 'fetch_response');
        }
      } catch (error) {
        // Model detection is best-effort: a non-JSON payload is expected and
        // harmless, anything else is a real detection bug worth surfacing.
        if (!(error instanceof SyntaxError)) {
          console.warn(`${TAG} Model detection failed for a fetch response:`, error);
        }
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
      } catch (error) {
        if (!(error instanceof SyntaxError)) {
          console.warn(`${TAG} Model detection failed for an XHR request body:`, error);
        }
      }

      this.addEventListener('load', function () {
        try {
          if (this.responseType && this.responseType !== 'text' && this.responseType !== 'json') return;
          const data = this.responseType === 'json' ? this.response : JSON.parse(this.responseText);
          const model = extractModelFromJson(data);
          if (model) sendDetection(model, 'xhr_response');
        } catch (error) {
          if (!(error instanceof SyntaxError)) {
            console.warn(`${TAG} Model detection failed for an XHR response:`, error);
          }
        }
      });

      return originalSend.apply(this, [body]);
    };
  }
})();
