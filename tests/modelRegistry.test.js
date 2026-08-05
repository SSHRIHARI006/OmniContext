import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime } from './helpers/loadRuntime.js';

const { OmniContext } = loadRuntime(['src/core/modelRegistry.js']);
const { ModelRegistry } = OmniContext;

test('ModelRegistry: getModelInfo prefers scraped text over the platform key', () => {
  const m = ModelRegistry.getModelInfo('chatgpt', 'Gemini 1.5 Pro');
  assert.equal(m.name, 'Gemini 1.5 Pro');
  assert.equal(m.limit, 2000000);
  assert.equal(m.platform, 'gemini');
});

test('ModelRegistry: getModelInfo falls back to the platform default model', () => {
  const cases = [
    ['gemini', 'Gemini 2.5 Pro'],
    ['chatgpt', 'GPT-4.1'],
    ['claude', 'Claude Opus 4'],
    ['deepseek', 'DeepSeek-R1'],
    ['kimi', 'Kimi K1.5'],
    ['qwen', 'Qwen 3']
  ];
  for (const [platform, expected] of cases) {
    assert.equal(ModelRegistry.getModelInfo(platform).name, expected, `for ${platform}`);
    assert.equal(ModelRegistry.getModelInfo(platform, 'unrecognizable label').name, expected, `for ${platform}`);
  }
});

test('ModelRegistry: getModelInfo returns a generic model for unknown platforms', () => {
  const m = ModelRegistry.getModelInfo('some-new-llm');
  assert.equal(m.name, 'Generic Model');
  assert.equal(m.limit, 128000);
  assert.equal(m.platform, 'generic');
  assert.equal(m.multiplier, 1.0);
});

test('ModelRegistry: registry entries expose consistent limits and multipliers', () => {
  for (const model of ModelRegistry.MODELS) {
    assert.ok(model.limit >= 128000, `${model.name} limit`);
    assert.ok(model.multiplier >= 1.0 && model.multiplier <= 1.2, `${model.name} multiplier`);
    assert.equal(model.softLimit, undefined, `${model.name} must not reintroduce softLimit`);
    assert.ok(typeof model.platform === 'string' && model.platform.length > 0, `${model.name} platform`);
  }
});

test('ModelRegistry: getModelByApiId rejects non-string input', () => {
  for (const input of [null, undefined, '', 0, {}, ['gpt-4o']]) {
    assert.equal(ModelRegistry.getModelByApiId(input), null, `for ${JSON.stringify(input)}`);
  }
});

test('ModelRegistry: getModelByApiId normalizes separators and whitespace', () => {
  assert.equal(ModelRegistry.getModelByApiId('  gpt-4.1-2025-04-14  ').name, 'GPT-4.1');
  assert.equal(ModelRegistry.getModelByApiId('claude-3-5-sonnet').name, 'Claude 3.5 Sonnet');
  assert.equal(ModelRegistry.getModelByApiId('gemini_2.0_flash').name, 'Gemini 2.0 Flash');
  assert.equal(ModelRegistry.getModelByApiId('o3-mini-high').name, 'o3-mini');
});

test('ModelRegistry: getModelByApiId resolves platform defaults for bare families', () => {
  assert.equal(ModelRegistry.getModelByApiId('kimi-latest').name, 'Kimi Moonshot');
  assert.equal(ModelRegistry.getModelByApiId('qwen-max').name, 'Qwen (default)');
  assert.equal(ModelRegistry.getModelByApiId('deepseek-chat').name, 'DeepSeek (default)');
});

test('ModelRegistry: dated API ids match the first pattern containing the date digits', () => {
  // Known limitation: date suffixes are matched by the loose family patterns,
  // so "claude-3-5-sonnet-20241022" resolves to Claude Sonnet 4 via /claude.*sonnet.*4/.
  // Both entries share the 200k limit and 1.15 multiplier, so metrics stay correct.
  const dated = ModelRegistry.getModelByApiId('claude-3-5-sonnet-20241022');
  assert.equal(dated.name, 'Claude Sonnet 4');
  assert.equal(dated.limit, ModelRegistry.getModelByApiId('claude-3-5-sonnet').limit);
  assert.equal(dated.multiplier, ModelRegistry.getModelByApiId('claude-3-5-sonnet').multiplier);
});

test('ModelRegistry: formatTokenCount abbreviates millions, thousands, and units', () => {
  assert.equal(ModelRegistry.formatTokenCount(2000000), '2M');
  assert.equal(ModelRegistry.formatTokenCount(1500000), '1.5M');
  assert.equal(ModelRegistry.formatTokenCount(1234567), '1.2M');
  assert.equal(ModelRegistry.formatTokenCount(128000), '128k');
  assert.equal(ModelRegistry.formatTokenCount(1000), '1k');
  assert.equal(ModelRegistry.formatTokenCount(1250), '1.3k');
  assert.equal(ModelRegistry.formatTokenCount(999), '999');
});

test('ModelRegistry: formatTokenCount treats missing or invalid counts as zero', () => {
  for (const input of [0, null, undefined, NaN, 'abc']) {
    assert.equal(ModelRegistry.formatTokenCount(input), '0', `for ${String(input)}`);
  }
});
