import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime } from './helpers/loadRuntime.js';

/** Response double exposing just clone()/json(). */
function jsonResponse(payload) {
  return {
    payload,
    clone() {
      return jsonResponse(payload);
    },
    async json() {
      if (payload === undefined) throw new Error('not json');
      return payload;
    }
  };
}

/** Installs the interceptor over a window double and returns the probes. */
function installInterceptor({ fetchImpl, includeXhr = true } = {}) {
  const messages = [];
  const fetchCalls = [];
  const xhrCalls = { opened: [], sent: [] };

  const originalFetch =
    fetchImpl ||
    (async (...args) => {
      fetchCalls.push(args);
      return jsonResponse(null);
    });

  class FakeXHR {
    constructor() {
      this.listeners = {};
      this.responseText = '';
    }

    open(method, url, ...rest) {
      xhrCalls.opened.push([method, url, ...rest]);
    }

    send(body) {
      xhrCalls.sent.push(body);
    }

    addEventListener(type, handler) {
      (this.listeners[type] = this.listeners[type] || []).push(handler);
    }

    emit(type) {
      for (const handler of this.listeners[type] || []) handler.call(this);
    }
  }

  const window = {
    fetch: originalFetch,
    XMLHttpRequest: includeXhr ? FakeXHR : undefined,
    postMessage: (message) => messages.push(message)
  };

  loadRuntime(['src/content/interceptor.js'], { window });
  return { window, messages, fetchCalls, xhrCalls, FakeXHR };
}

test('interceptor: marks the page and patches fetch and XHR once', () => {
  const { window } = installInterceptor();
  assert.equal(window.__omniContextIntercepted, true);

  const patchedFetch = window.fetch;
  const patchedSend = window.XMLHttpRequest.prototype.send;
  loadRuntime(['src/content/interceptor.js'], { window });
  assert.equal(window.fetch, patchedFetch, 'fetch must not be double-patched');
  assert.equal(window.XMLHttpRequest.prototype.send, patchedSend, 'send must not be double-patched');
});

test('interceptor: reports the model from a fetch request body', async () => {
  const { window, messages, fetchCalls } = installInterceptor();

  const response = await window.fetch('https://chatgpt.com/backend-api/conversation', {
    method: 'POST',
    body: JSON.stringify({ model: 'gpt-4.1', messages: [] })
  });

  assert.equal(fetchCalls.length, 1, 'original fetch must still be called');
  assert.ok(response);
  assert.deepEqual([...messages].map((message) => ({ ...message })), [
    { type: 'OMNI_MODEL_DETECTED', modelId: 'gpt-4.1', source: 'fetch_request' }
  ]);
});

test('interceptor: reports the model from a fetch response payload', async () => {
  const { window, messages } = installInterceptor({
    fetchImpl: async () => jsonResponse({ message: { model: 'claude-sonnet-4' } })
  });

  await window.fetch(new URL('https://claude.ai/api/append_message'));
  assert.deepEqual([...messages].map((message) => ({ ...message })), [
    { type: 'OMNI_MODEL_DETECTED', modelId: 'claude-sonnet-4', source: 'fetch_response' }
  ]);
});

test('interceptor: reads model ids from nested metadata and body arrays', async () => {
  const payloads = [
    { model_id: 'gemini-2.5-pro' },
    { metadata: { model: 'o3-mini' } },
    { body: [{ nothing: true }, { model: 'deepseek-r1' }] }
  ];

  for (const payload of payloads) {
    const { window, messages } = installInterceptor({ fetchImpl: async () => jsonResponse(payload) });
    await window.fetch('https://example.com/api');
    assert.equal(messages.length, 1, JSON.stringify(payload));
    assert.equal(messages[0].source, 'fetch_response');
  }
});

test('interceptor: trims model ids and ignores unusable ones', async () => {
  const { window, messages } = installInterceptor();
  await window.fetch('https://example.com/api', { body: JSON.stringify({ model: '  gpt-4o  ' }) });
  assert.equal(messages[0].modelId, 'gpt-4o');

  for (const payload of [{ model: 42 }, { model: null }, { model: { name: 'x' } }, {}]) {
    const attempt = installInterceptor();
    await attempt.window.fetch('https://example.com/api', { body: JSON.stringify(payload) });
    assert.equal(attempt.messages.length, 0, JSON.stringify(payload));
  }
});

test('interceptor: stays silent for non-JSON bodies and responses', async () => {
  const { window, messages } = installInterceptor({
    fetchImpl: async () => jsonResponse(undefined)
  });

  await window.fetch('https://example.com/api', { body: 'not-json' });
  await window.fetch('https://example.com/api', { body: new Uint8Array([1, 2, 3]) });
  assert.deepEqual(messages, []);
});

test('interceptor: propagates fetch rejections unchanged', async () => {
  const failure = new Error('offline');
  const { window, messages } = installInterceptor({
    fetchImpl: async () => {
      throw failure;
    }
  });

  await assert.rejects(() => window.fetch('https://example.com/api'), failure);
  assert.deepEqual(messages, []);
});

test('interceptor: records the XHR url and reports request-body models', () => {
  const { window, messages, xhrCalls } = installInterceptor();
  const xhr = new window.XMLHttpRequest();

  xhr.open('POST', 'https://gemini.google.com/api/generate', true);
  xhr.send(JSON.stringify({ model: 'gemini-2.5-flash' }));

  assert.equal(xhr.__omniUrl, 'https://gemini.google.com/api/generate');
  assert.deepEqual(xhrCalls.opened[0], ['POST', 'https://gemini.google.com/api/generate', true]);
  assert.equal(xhrCalls.sent.length, 1, 'original send must still be called');
  assert.deepEqual([...messages].map((message) => ({ ...message })), [
    { type: 'OMNI_MODEL_DETECTED', modelId: 'gemini-2.5-flash', source: 'xhr_request' }
  ]);
});

test('interceptor: reports models found in the XHR response on load', () => {
  const { window, messages } = installInterceptor();
  const xhr = new window.XMLHttpRequest();

  xhr.open('GET', 'https://example.com/api');
  xhr.send();
  xhr.responseText = JSON.stringify({ model: 'qwen3-max' });
  xhr.emit('load');

  assert.deepEqual([...messages].map((message) => ({ ...message })), [
    { type: 'OMNI_MODEL_DETECTED', modelId: 'qwen3-max', source: 'xhr_response' }
  ]);
});

test('interceptor: ignores non-JSON XHR payloads', () => {
  const { window, messages } = installInterceptor();
  const xhr = new window.XMLHttpRequest();

  xhr.open('GET', 'https://example.com/page.html');
  xhr.send('<html></html>');
  xhr.responseText = '<html></html>';
  xhr.emit('load');

  assert.deepEqual(messages, []);
});

test('interceptor: survives a window without XMLHttpRequest', async () => {
  const { window, messages } = installInterceptor({ includeXhr: false });
  await window.fetch('https://example.com/api', { body: JSON.stringify({ model: 'kimi-k1.5' }) });
  assert.equal(messages[0].modelId, 'kimi-k1.5');
});

test('interceptor: tolerates a postMessage that throws', async () => {
  const window = {
    fetch: async () => ({}),
    postMessage() {
      throw new Error('page tearing down');
    }
  };
  loadRuntime(['src/content/interceptor.js'], { window });

  await assert.doesNotReject(() =>
    window.fetch('https://example.com/api', { body: JSON.stringify({ model: 'gpt-4o' }) })
  );
});
