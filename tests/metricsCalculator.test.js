/**
 * Signal-level tests for MetricsCalculator, complementing the end-to-end
 * scoring scenarios in tests/metrics.test.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime } from './helpers/loadRuntime.js';

const { OmniContext } = loadRuntime([
  'src/core/modelRegistry.js',
  'src/core/tokenEngine.js',
  'src/core/metricsCalculator.js'
]);
const { MetricsCalculator } = OmniContext;

const sentence = (word, count = 8) => Array.from({ length: count }, (_, i) => `${word}${i}`).join(' ');

test('MetricsCalculator: classifyStatus maps every score tier', () => {
  const tiers = [
    [0, 'optimal'],
    [39, 'optimal'],
    [40, 'dense'],
    [64, 'dense'],
    [65, 'degrading'],
    [84, 'degrading'],
    [85, 'bloated'],
    [100, 'bloated']
  ];
  for (const [score, expected] of tiers) {
    assert.equal(MetricsCalculator.classifyStatus(score), expected, `for ${score}`);
  }
});

test('MetricsCalculator: calculateRedundancy scores repeated 5-grams only', () => {
  const unique = [{ text: sentence('alpha', 30) }];
  assert.equal(MetricsCalculator.calculateRedundancy(unique), 0);

  const line = 'the deployment pipeline must be rebuilt from scratch again';
  const repeated = [{ text: line }, { text: line }, { text: line }];
  const score = MetricsCalculator.calculateRedundancy(repeated);
  assert.ok(score > 100 / 2, `expected a high redundancy index, got ${score}`);
  assert.ok(score <= 100);

  assert.equal(MetricsCalculator.calculateRedundancy([]), 0, 'no shingles means no redundancy');
  assert.equal(MetricsCalculator.calculateRedundancy([{ text: 'too short' }]), 0);
  assert.equal(MetricsCalculator.calculateRedundancy([{}]), 0, 'messages without text are skipped');
});

test('MetricsCalculator: calculateInfoDecay needs six messages before scoring', () => {
  const messages = Array.from({ length: 5 }, (_, i) => ({ text: sentence(`topic${i}`) }));
  assert.equal(MetricsCalculator.calculateInfoDecay(messages), 0);
  assert.equal(MetricsCalculator.calculateInfoDecay([]), 0);
  assert.equal(MetricsCalculator.calculateInfoDecay(null), 0);
});

test('MetricsCalculator: calculateInfoDecay rises when late turns stop adding vocabulary', () => {
  const fresh = Array.from({ length: 8 }, (_, i) => ({ text: sentence(`subject${i}`) }));
  const freshDecay = MetricsCalculator.calculateInfoDecay(fresh);

  const stale = [
    ...Array.from({ length: 4 }, (_, i) => ({ text: sentence(`subject${i}`) })),
    ...Array.from({ length: 4 }, () => ({ text: sentence('subject0') }))
  ];
  const staleDecay = MetricsCalculator.calculateInfoDecay(stale);

  assert.ok(staleDecay > freshDecay, `${staleDecay} should exceed ${freshDecay}`);
  assert.ok(staleDecay <= 100);
});

test('MetricsCalculator: calculateInfoDecay ignores messages without long words', () => {
  const messages = Array.from({ length: 6 }, () => ({ text: 'a an of to' }));
  assert.equal(MetricsCalculator.calculateInfoDecay(messages), 0);
});

test('MetricsCalculator: calculateTurnDepth grows with turns and shrinks with capacity', () => {
  assert.equal(MetricsCalculator.calculateTurnDepth(0, 1000, 128000), 0);

  const shallow = MetricsCalculator.calculateTurnDepth(4, 4000, 128000);
  const deep = MetricsCalculator.calculateTurnDepth(40, 40000, 128000);
  assert.ok(deep > shallow, `${deep} should exceed ${shallow}`);

  const smallWindow = MetricsCalculator.calculateTurnDepth(20, 20000, 32000);
  const largeWindow = MetricsCalculator.calculateTurnDepth(20, 20000, 1000000);
  assert.ok(smallWindow > largeWindow, `${smallWindow} should exceed ${largeWindow}`);
  assert.equal(MetricsCalculator.calculateTurnDepth(500, 500000, 32000), 100, 'capped at 100');
});

test('MetricsCalculator: calculateTurnDepth assumes a default turn size for empty turns', () => {
  const withDefault = MetricsCalculator.calculateTurnDepth(10, 0, 128000);
  const expected = (10 / (128000 / MetricsCalculator.DEFAULT_TOKENS_PER_TURN)) * 100;
  assert.equal(withDefault, expected);
});

test('MetricsCalculator: calculateCodeRepetition only penalizes duplicated blocks', () => {
  const block = (name) => `function ${name}() { return computeSomethingUseful(); }`;

  assert.equal(MetricsCalculator.calculateCodeRepetition([]), 0);
  assert.equal(MetricsCalculator.calculateCodeRepetition(null), 0);
  assert.equal(MetricsCalculator.calculateCodeRepetition([{ codeText: block('a') }]), 0, 'one block cannot repeat');
  assert.equal(
    MetricsCalculator.calculateCodeRepetition([{ codeText: 'x = 1;' }, { codeText: 'y = 2;' }]),
    0,
    'blocks under 20 chars are ignored'
  );
  assert.equal(
    MetricsCalculator.calculateCodeRepetition([{ codeText: block('a') }, { codeText: block('b') }]),
    0
  );

  const halved = MetricsCalculator.calculateCodeRepetition([
    { codeText: block('a') },
    { codeText: block('a') },
    { codeText: block('b') },
    { codeText: block('c') }
  ]);
  assert.equal(halved, 25);
  assert.equal(
    MetricsCalculator.calculateCodeRepetition([
      { codeText: block('a') },
      { codeText: `  ${block('a')}\n\n` }
    ]),
    50,
    'whitespace differences still count as repetition'
  );
});

test('MetricsCalculator: unknown roles are bucketed with assistant tokens', () => {
  const metrics = MetricsCalculator.calculateMetrics(
    [
      { role: 'user', text: sentence('question') },
      { role: 'system', text: sentence('directive') }
    ],
    { hardLimitTokens: 128000 }
  );

  assert.ok(metrics.userTokens > 0);
  assert.ok(metrics.assistantTokens > 0);
  assert.equal(metrics.totalTokens, metrics.userTokens + metrics.assistantTokens);
  assert.equal(metrics.turnCount, 1, 'system messages do not add assistant turns');
  assert.equal(metrics.userRatio + metrics.assistantRatio, 100);
});

test('MetricsCalculator: platform config selects the context limit and multiplier', () => {
  const messages = [{ role: 'user', text: sentence('capacity', 40) }];

  const fallback = MetricsCalculator.calculateMetrics(messages, {});
  assert.equal(fallback.contextLimit, 128000);
  assert.equal(fallback.softLimit, 128000, 'back-compat alias mirrors contextLimit');

  const aliased = MetricsCalculator.calculateMetrics(messages, { contextLimit: 200000 });
  assert.equal(aliased.contextLimit, 200000);
  assert.equal(aliased.remainingTokens, 200000 - aliased.totalTokens);

  const multiplied = MetricsCalculator.calculateMetrics(messages, { tokenMultiplier: 1.15 });
  assert.ok(multiplied.totalTokens > fallback.totalTokens, 'multiplier inflates token totals');
});

test('MetricsCalculator: code density is reported without inflating the score', () => {
  const code = 'const results = items.map((item) => transform(item)).filter(Boolean);';
  const metrics = MetricsCalculator.calculateMetrics(
    [{ role: 'assistant', text: `Here you go:\n${code}`, codeText: code }],
    { hardLimitTokens: 128000 }
  );

  assert.ok(metrics.codeDensity > 0 && metrics.codeDensity <= 100);
  assert.equal(metrics.signals.codeRepetition, 0, 'a single code block is not repetition');
});

test('MetricsCalculator: capacity pressure saturates when the window overflows', () => {
  const messages = Array.from({ length: 20 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    text: sentence(`overflow${i}`, 200)
  }));

  const metrics = MetricsCalculator.calculateMetrics(messages, { hardLimitTokens: 1000 });
  assert.equal(metrics.capacityUsed, 100);
  assert.equal(metrics.signals.capacityPressure, 100);
  assert.equal(metrics.remainingTokens, 0);
  assert.equal(metrics.healthScore, Math.max(metrics.bloatScore, metrics.rotScore));
  // A full window alone contributes 0.35·Cp to bloat, so it degrades the tier
  // without pinning the score at 100 on its own.
  assert.ok(metrics.bloatScore >= 35, `bloat ${metrics.bloatScore}`);
  assert.notEqual(metrics.statusLevel, 'optimal');
});
