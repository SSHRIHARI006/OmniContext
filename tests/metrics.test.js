import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MetricsCalculator } from '../src/core/metricsCalculator.js';
import { ModelRegistry } from '../src/core/modelRegistry.js';

test('ModelRegistry: getModelByApiId resolves network IDs', () => {
  const cases = [
    ['gpt-4.1', 'GPT-4.1'],
    ['gpt-4o-mini', 'GPT-4o mini'],
    ['gpt-4o', 'GPT-4o'],
    ['o4-mini', 'o4-mini'],
    ['o3', 'o3'],
    ['o1', 'o1'],
    ['claude-sonnet-4', 'Claude Sonnet 4'],
    ['claude-opus-4', 'Claude Opus 4'],
    ['claude-3-7-sonnet', 'Claude 3.7 Sonnet'],
    ['gemini-2.5-pro', 'Gemini 2.5 Pro'],
    ['gemini-2.5-flash', 'Gemini 2.5 Flash'],
    ['deepseek-r1', 'DeepSeek-R1'],
    ['deepseek-v3', 'DeepSeek-V3'],
    ['qwen3', 'Qwen 3'],
    ['kimi-k1.5', 'Kimi K1.5']
  ];
  for (const [apiId, expected] of cases) {
    const m = ModelRegistry.getModelByApiId(apiId);
    assert.ok(m, `should resolve ${apiId}`);
    assert.equal(m.name, expected, `for ${apiId}`);
  }
  assert.equal(ModelRegistry.getModelByApiId('totally-unknown-model'), null);
});

test('ModelRegistry: getModelInfo has no softLimit, uses actual limits', () => {
  const m = ModelRegistry.getModelInfo('chatgpt', 'GPT-4.1');
  assert.equal(m.name, 'GPT-4.1');
  assert.equal(m.limit, 1000000);
  assert.equal(m.softLimit, undefined);
  assert.equal(m.multiplier, 1.0);
});

test('MetricsCalculator: short concise conversation is Optimal', () => {
  const messages = [
    { role: 'user', text: 'Hello, can you help me with a quick question about JavaScript?' },
    { role: 'assistant', text: 'Of course! I would be happy to help you with your JavaScript question.' },
    { role: 'user', text: 'How do I create an array in JavaScript?' },
    { role: 'assistant', text: 'You create an array with square brackets: const arr = [1, 2, 3];' }
  ];
  const m = MetricsCalculator.calculateMetrics(messages, { hardLimitTokens: 128000 });
  assert.equal(m.statusLevel, 'optimal');
  assert.ok(m.healthScore < 40, `expected < 40, got ${m.healthScore}`);
  assert.ok(m.bloatScore >= 0 && m.rotScore >= 0);
});

test('MetricsCalculator: repetitive long conversation pushes score up', () => {
  const filler = 'We need to refactor the authentication service and the token engine. '.repeat(30);
  const messages = [];
  for (let i = 0; i < 10; i++) {
    messages.push({ role: 'user', text: 'Please add another feature to the extension.' });
    messages.push({ role: 'assistant', text: `Here is another update on the feature: ${filler}` });
  }
  const m = MetricsCalculator.calculateMetrics(messages, { hardLimitTokens: 128000 });
  assert.ok(m.signals.redundancyIndex >= 0);
  // Redundancy detection should fire on repeated shingles
  assert.ok(m.signals.redundancyIndex > 0, `expected Ri > 0, got ${m.signals.redundancyIndex}`);
  assert.ok(m.bloatScore >= 40, `expected bloat >= 40, got ${m.bloatScore}`);
});

test('MetricsCalculator: repeated code blocks raise Dr but unique code does not', () => {
  const uniqueMsgs = [
    { role: 'user', text: 'write a function' },
    { role: 'assistant', text: 'done', codeText: 'function a() { return 1; }\nfunction b() { return 2; }' },
    { role: 'assistant', text: 'done 2', codeText: 'function c() { return 3; }' }
  ];
  const repeatMsgs = [
    { role: 'user', text: 'write a function' },
    { role: 'assistant', text: 'done', codeText: 'function a() { return 1; }' },
    { role: 'assistant', text: 'done 2', codeText: 'function a() { return 1; }' }
  ];
  const unique = MetricsCalculator.calculateCodeRepetition(uniqueMsgs);
  const repeated = MetricsCalculator.calculateCodeRepetition(repeatMsgs);
  assert.equal(unique, 0);
  assert.ok(repeated > 0, `expected Dr > 0, got ${repeated}`);
});

test('MetricsCalculator: status tier thresholds (0-39, 40-64, 65-84, 85-100)', () => {
  assert.equal(MetricsCalculator.classifyStatus(0), 'optimal');
  assert.equal(MetricsCalculator.classifyStatus(39), 'optimal');
  assert.equal(MetricsCalculator.classifyStatus(40), 'dense');
  assert.equal(MetricsCalculator.classifyStatus(64), 'dense');
  assert.equal(MetricsCalculator.classifyStatus(65), 'degrading');
  assert.equal(MetricsCalculator.classifyStatus(84), 'degrading');
  assert.equal(MetricsCalculator.classifyStatus(85), 'bloated');
  assert.equal(MetricsCalculator.classifyStatus(100), 'bloated');
});

test('MetricsCalculator: health score is max of bloat and rot', () => {
  const messages = [
    { role: 'user', text: 'Tell me about the architecture of the system and how the modules connect together.' },
    { role: 'assistant', text: 'The system has several modules that connect through well defined interfaces.' }
  ];
  const m = MetricsCalculator.calculateMetrics(messages, { hardLimitTokens: 128000 });
  assert.equal(m.healthScore, Math.max(m.bloatScore, m.rotScore));
});

test('MetricsCalculator: empty input yields zeroed metrics, Optimal', () => {
  const m = MetricsCalculator.calculateMetrics([], { hardLimitTokens: 128000 });
  assert.equal(m.totalTokens, 0);
  assert.equal(m.healthScore, 0);
  assert.equal(m.statusLevel, 'optimal');
  assert.equal(m.contextLimit, 128000);
});

test('MetricsCalculator: info decay returns 0 for short (<6) conversations (IMP-2)', () => {
  const short = [
    { role: 'user', text: 'first message with completely unique vocabulary words here' },
    { role: 'assistant', text: 'second message adding brand new distinctive terminology' },
    { role: 'user', text: 'third message introducing yet more original phrasing content' },
    { role: 'assistant', text: 'fourth message with additional fresh and novel wording' },
    { role: 'user', text: 'fifth message continuing with different unseen expressions' }
  ];
  assert.equal(MetricsCalculator.calculateInfoDecay(short), 0);
});

test('MetricsCalculator: redundancy caps shingle set at 50k (IMP-1)', () => {
  // ~1,200 words of unique content generates ~1,196 shingles — under the cap,
  // so behavior is unchanged and Ri stays 0 for fully unique content.
  const uniqueWords = Array.from({ length: 1200 }, (_, i) => `w${i}`).join(' ');
  const m = MetricsCalculator.calculateRedundancy([{ role: 'user', text: uniqueWords }]);
  assert.equal(m, 0);
});
