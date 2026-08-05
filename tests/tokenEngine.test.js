import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime } from './helpers/loadRuntime.js';

const { OmniContext } = loadRuntime(['src/core/tokenEngine.js']);
const { TokenEngine } = OmniContext;

test('TokenEngine: non-string and empty input yield a zeroed analysis', () => {
  const zeroed = { rawTokens: 0, wordCount: 0, charCount: 0, codeTokens: 0 };
  for (const input of ['', null, undefined, 42, {}, []]) {
    assert.deepEqual({ ...TokenEngine.countTokens(input) }, zeroed, `for ${JSON.stringify(input)}`);
  }
});

test('TokenEngine: counts words and characters of prose', () => {
  const { rawTokens, wordCount, charCount } = TokenEngine.countTokens('hello world from omnicontext');
  assert.equal(wordCount, 4);
  assert.equal(charCount, 28);
  assert.ok(rawTokens >= 4, `expected at least one token per word, got ${rawTokens}`);
  assert.ok(Number.isInteger(rawTokens));
});

test('TokenEngine: token count grows monotonically with text length', () => {
  const short = TokenEngine.countTokens('The quick brown fox jumps over the lazy dog.');
  const long = TokenEngine.countTokens('The quick brown fox jumps over the lazy dog. '.repeat(20));
  assert.ok(long.rawTokens > short.rawTokens * 10, `${long.rawTokens} vs ${short.rawTokens}`);
});

test('TokenEngine: CJK text costs more tokens per character than ASCII', () => {
  const cjk = TokenEngine.countTokens('今天天气很好我们去公园散步吧');
  const ascii = TokenEngine.countTokens('abcdefghijklmn');
  assert.equal(cjk.charCount, ascii.charCount);
  assert.ok(cjk.rawTokens > ascii.rawTokens, `${cjk.rawTokens} vs ${ascii.rawTokens}`);
  // 14 CJK characters at ~1.3 tokens each
  assert.equal(cjk.rawTokens, 19);
});

test('TokenEngine: newlines and space runs are charged as whitespace tokens', () => {
  assert.equal(TokenEngine.countTokens('\n\n\n').rawTokens, 3);
  assert.equal(TokenEngine.countTokens('        ').rawTokens, 2);
  assert.equal(TokenEngine.countTokens('\n    ').rawTokens, 2);
});

test('TokenEngine: punctuation runs cost about one token per two symbols', () => {
  assert.equal(TokenEngine.countTokens('!').rawTokens, 1);
  assert.equal(TokenEngine.countTokens('();').rawTokens, 3);
});

test('TokenEngine: camelCase and snake_case identifiers split into subwords', () => {
  const camel = TokenEngine.countTokens('getUserProfileData');
  const flat = TokenEngine.countTokens('getuserprofiledata');
  assert.equal(camel.charCount, flat.charCount);
  assert.equal(camel.rawTokens, 5); // get + User + Profile + Data subwords
  assert.equal(flat.rawTokens, 6); // one unsplit 18-char run
  // snake_case: user + profile + id subwords plus one token per underscore
  assert.equal(TokenEngine.countTokens('user_profile_id').rawTokens, 6);
});

test('TokenEngine: long words are charged proportionally to their length', () => {
  assert.equal(TokenEngine.countTokens('tiny').rawTokens, 1);
  assert.equal(TokenEngine.countTokens('mediums').rawTokens, 2);
  assert.equal(TokenEngine.countTokens('extraordinarily').rawTokens, 5);
});

test('TokenEngine: applyMultiplier rounds up and defaults to 1x', () => {
  assert.equal(TokenEngine.applyMultiplier(100), 100);
  assert.equal(TokenEngine.applyMultiplier(100, 1.15), 115);
  assert.equal(TokenEngine.applyMultiplier(101, 1.05), 107);
  assert.equal(TokenEngine.applyMultiplier(0, 1.15), 0);
});

test('TokenEngine: analyzeTextTokens reports multiplied total and code tokens', () => {
  const code = 'const total = items.reduce((sum, item) => sum + item.value, 0);';
  const full = `Here is the snippet you asked for:\n${code}`;

  const analysis = TokenEngine.analyzeTextTokens(full, code, 1.1);
  const rawFull = TokenEngine.countTokens(full).rawTokens;
  const rawCode = TokenEngine.countTokens(code).rawTokens;

  assert.equal(analysis.totalTokens, Math.ceil(rawFull * 1.1));
  assert.equal(analysis.codeTokens, Math.ceil(rawCode * 1.1));
  assert.ok(analysis.codeTokens < analysis.totalTokens);
  assert.equal(analysis.charCount, full.length);
  assert.equal(analysis.wordCount, TokenEngine.countTokens(full).wordCount);
});

test('TokenEngine: analyzeTextTokens defaults code text to empty and multiplier to 1x', () => {
  const analysis = TokenEngine.analyzeTextTokens('plain prose without code');
  assert.equal(analysis.codeTokens, 0);
  assert.equal(analysis.totalTokens, TokenEngine.countTokens('plain prose without code').rawTokens);
});
