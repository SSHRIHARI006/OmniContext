import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime } from './helpers/loadRuntime.js';

/**
 * Loads the background worker against an extension API double.
 * @param {Object} [options] `namespace` selects browser.* vs chrome.*,
 *   `actionKey` selects the MV3 `action` vs MV2 `browserAction` API.
 */
function loadWorker({ namespace = 'browser', actionKey = 'action' } = {}) {
  const badge = { text: [], color: [] };
  const stored = [];
  const listeners = { installed: [], message: [] };

  const api = {
    runtime: {
      onInstalled: { addListener: (fn) => listeners.installed.push(fn) },
      onMessage: { addListener: (fn) => listeners.message.push(fn) }
    },
    storage: {
      local: { set: (payload) => stored.push(payload) }
    },
    [actionKey]: {
      setBadgeText: ({ text }) => badge.text.push(text),
      setBadgeBackgroundColor: ({ color }) => badge.color.push(color)
    }
  };

  loadRuntime(['src/background/serviceWorker.js'], {
    [namespace]: api,
    console: { log() {}, warn() {}, error() {}, debug() {} }
  });

  const dispatch = (message, sender) => listeners.message[0](message, sender);
  return { api, badge, stored, listeners, dispatch };
}

const metrics = (overrides = {}) => ({ healthScore: 10, totalTokens: 100, ...overrides });

test('serviceWorker: registers install and message listeners', () => {
  const worker = loadWorker();
  assert.equal(worker.listeners.installed.length, 1);
  assert.equal(worker.listeners.message.length, 1);
});

test('serviceWorker: install sets the idle badge', () => {
  const worker = loadWorker();
  worker.listeners.installed[0]();
  assert.deepEqual(worker.badge.text, ['OMNI']);
  assert.deepEqual(worker.badge.color, ['#38bdf8']);
});

test('serviceWorker: works with the chrome namespace and MV2 browserAction', () => {
  const worker = loadWorker({ namespace: 'chrome', actionKey: 'browserAction' });
  worker.listeners.installed[0]();
  assert.deepEqual(worker.badge.text, ['OMNI']);
});

test('serviceWorker: badge color follows the health tiers', () => {
  const tiers = [
    [0, '#4ade80'],
    [39, '#4ade80'],
    [40, '#eab308'],
    [64, '#eab308'],
    [65, '#f97316'],
    [84, '#f97316'],
    [85, '#ef4444'],
    [100, '#ef4444']
  ];

  for (const [healthScore, expected] of tiers) {
    const worker = loadWorker();
    worker.dispatch({ type: 'OMNI_METRICS_UPDATE', metrics: metrics({ healthScore }) });
    assert.deepEqual(worker.badge.color, [expected], `for health ${healthScore}`);
  }
});

test('serviceWorker: falls back to bloatScore when no health score is present', () => {
  const worker = loadWorker();
  worker.dispatch({ type: 'OMNI_METRICS_UPDATE', metrics: { bloatScore: 90, totalTokens: 50 } });
  assert.deepEqual(worker.badge.color, ['#ef4444']);
  assert.deepEqual(worker.badge.text, ['50']);
});

test('serviceWorker: badge text abbreviates thousands of tokens', () => {
  const cases = [
    [0, '0'],
    [999, '999'],
    [1000, '1.0k'],
    [12345, '12.3k'],
    [1000000, '1000.0k']
  ];

  for (const [totalTokens, expected] of cases) {
    const worker = loadWorker();
    worker.dispatch({ type: 'OMNI_METRICS_UPDATE', metrics: metrics({ totalTokens }) });
    assert.deepEqual(worker.badge.text, [expected], `for ${totalTokens} tokens`);
  }
});

test('serviceWorker: persists metrics per tab and as the active snapshot', () => {
  const worker = loadWorker();
  worker.dispatch(
    {
      type: 'OMNI_METRICS_UPDATE',
      metrics: metrics({ healthScore: 70, totalTokens: 4200 }),
      platformKey: 'claude',
      url: 'https://claude.ai/chat/abc'
    },
    { tab: { id: 7 } }
  );

  assert.equal(worker.stored.length, 1);
  const written = worker.stored[0];
  assert.deepEqual(Object.keys(written).sort(), ['activeMetrics', 'tab_metrics_7']);
  assert.equal(written.tab_metrics_7, written.activeMetrics);
  assert.equal(written.activeMetrics.platformKey, 'claude');
  assert.equal(written.activeMetrics.url, 'https://claude.ai/chat/abc');
  assert.equal(written.activeMetrics.metrics.totalTokens, 4200);
  assert.ok(written.activeMetrics.timestamp > 0);
});

test('serviceWorker: stores only the active snapshot without a sender tab', () => {
  const worker = loadWorker();
  worker.dispatch({ type: 'OMNI_METRICS_UPDATE', metrics: metrics(), platformKey: 'chatgpt' }, {});
  assert.deepEqual(Object.keys(worker.stored[0]), ['activeMetrics']);

  const noSender = loadWorker();
  noSender.dispatch({ type: 'OMNI_METRICS_UPDATE', metrics: metrics(), platformKey: 'chatgpt' });
  assert.deepEqual(Object.keys(noSender.stored[0]), ['activeMetrics']);
});

test('serviceWorker: ignores unrelated or malformed messages', () => {
  const worker = loadWorker();
  for (const message of [null, undefined, {}, { type: 'SOMETHING_ELSE' }]) {
    assert.equal(worker.dispatch(message), true, 'listener keeps the response channel open');
  }
  assert.deepEqual(worker.stored, []);
  assert.deepEqual(worker.badge.text, []);
});

test('serviceWorker: skips the badge update when metrics are missing', () => {
  const worker = loadWorker();
  worker.dispatch({ type: 'OMNI_METRICS_UPDATE', metrics: null, platformKey: 'gemini' });
  assert.deepEqual(worker.badge.text, []);
  assert.equal(worker.stored.length, 1, 'the empty snapshot is still persisted');
});
