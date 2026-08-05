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

  // Only request/response payloads of conversation endpoints are inspected, so
  // unrelated traffic (auth, billing, telemetry) is never parsed or read.
  const MODEL_ENDPOINT_PATTERN = /(conversation|completion|chat|message|generate|stream|api\/v\d)/i;

  // Guards against parsing multi-megabyte payloads on every request.
  const MAX_PAYLOAD_CHARS = 256 * 1024;
  const MAX_MODEL_ID_LENGTH = 200;

  function isRelevantUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    return MODEL_ENDPOINT_PATTERN.test(url);
  }

  function parsePayload(text) {
    if (typeof text !== 'string' || !text || text.length > MAX_PAYLOAD_CHARS) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  function sendDetection(modelId, source) {
    if (!modelId || typeof modelId !== 'string') return;
    const trimmed = modelId.trim();
    if (!trimmed || trimmed.length > MAX_MODEL_ID_LENGTH) return;
    try {
      // '/' restricts delivery to same-origin listeners (the isolated-world
      // content script) instead of broadcasting to any cross-origin frame.
      window.postMessage(
        {
          type: 'OMNI_MODEL_DETECTED',
          modelId: trimmed,
          source: source || 'unknown'
        },
        '/'
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
        const urlString = typeof url === 'string'
          ? url
          : url instanceof URL
            ? url.href
            : url && typeof url.url === 'string' ? url.url : '';
        if (!isRelevantUrl(urlString)) return response;

        if (options && typeof options.body === 'string') {
          const model = extractModelFromJson(parsePayload(options.body));
          if (model) sendDetection(model, 'fetch_request');
        }
        if (response && typeof response.clone === 'function') {
          const cloned = response.clone();
          const text = await cloned.text().catch(() => '');
          const model = extractModelFromJson(parsePayload(text));
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
      if (!isRelevantUrl(this.__omniUrl)) return originalSend.apply(this, [body]);

      try {
        if (typeof body === 'string') {
          const model = extractModelFromJson(parsePayload(body));
          if (model) sendDetection(model, 'xhr_request');
        }
      } catch (e) {
        /* non-JSON body — ignore */
      }

      this.addEventListener('load', function () {
        try {
          const model = extractModelFromJson(parsePayload(this.responseText));
          if (model) sendDetection(model, 'xhr_response');
        } catch (e) {
          /* non-JSON response — ignore */
        }
      });

      return originalSend.apply(this, [body]);
    };
  }
})();
