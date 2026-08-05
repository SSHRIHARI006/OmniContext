import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, el } from './helpers/fakeDom.js';
import { loadRuntime } from './helpers/loadRuntime.js';

function withDom(children) {
  const document = createDocument(children);
  const warnings = [];
  const quietConsole = {
    log() {},
    warn: (...args) => warnings.push(args.join(' ')),
    error: (...args) => warnings.push(args.join(' ')),
    debug() {}
  };
  const { OmniContext } = loadRuntime(['src/core/migrationPrompt.js'], {
    document,
    console: quietConsole
  });
  return { document, warnings, ...OmniContext };
}

test('MigrationPromptEngine: prompt text asks for a structured handoff summary', () => {
  const { MigrationPromptEngine, MIGRATION_PROMPT_TEXT } = withDom([]);
  const text = MigrationPromptEngine.getPromptText();
  assert.equal(text, MIGRATION_PROMPT_TEXT);
  assert.match(text, /Markdown summary/);
  assert.match(text, /architectural decisions/);
});

test('MigrationPromptEngine: injects into a textarea and notifies listeners', () => {
  const textarea = el('textarea', { placeholder: 'Ask anything' });
  const { MigrationPromptEngine, MIGRATION_PROMPT_TEXT } = withDom([textarea]);

  assert.equal(MigrationPromptEngine.injectPromptIntoInput(textarea), true);
  assert.equal(textarea.value, MIGRATION_PROMPT_TEXT);
  assert.equal(textarea.focused, true);
  assert.deepEqual(textarea.dispatchedEvents.map((event) => event.type), ['input', 'change']);
  assert.ok(textarea.dispatchedEvents.every((event) => event.bubbles === true));
});

test('MigrationPromptEngine: injects into a contenteditable as text, not value', () => {
  const editable = el('div', { contenteditable: 'true', 'data-placeholder': 'Message Claude' });
  const { MigrationPromptEngine, MIGRATION_PROMPT_TEXT } = withDom([editable]);

  assert.equal(MigrationPromptEngine.injectPromptIntoInput(editable), true);
  assert.equal(editable.innerText, MIGRATION_PROMPT_TEXT);
  assert.equal(editable.value, undefined);
  assert.equal(editable.focused, true);
  assert.equal(editable.dispatchedEvents.length, 1);
  assert.equal(editable.dispatchedEvents[0].inputType, 'insertText');
  assert.equal(editable.dispatchedEvents[0].data, MIGRATION_PROMPT_TEXT);
});

test('MigrationPromptEngine: falls back to discovering the input when none is passed', () => {
  const textarea = el('textarea', { id: 'prompt-textarea' });
  const { MigrationPromptEngine, MIGRATION_PROMPT_TEXT } = withDom([
    el('main', {}, [el('div', {}, [textarea])])
  ]);

  assert.equal(MigrationPromptEngine.injectPromptIntoInput(), true);
  assert.equal(textarea.value, MIGRATION_PROMPT_TEXT);
});

test('MigrationPromptEngine: reports failure and warns when no input exists', () => {
  const { MigrationPromptEngine, warnings } = withDom([el('main', {}, [el('p', { text: 'no input here' })])]);
  assert.equal(MigrationPromptEngine.injectPromptIntoInput(), false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Could not find input element/);
});

test('MigrationPromptEngine: findChatInput follows the provider selector priority', () => {
  const chatgpt = el('textarea', { id: 'prompt-textarea' });
  const generic = el('textarea', { placeholder: 'Send a message' });
  const { MigrationPromptEngine } = withDom([generic, chatgpt]);
  assert.equal(MigrationPromptEngine.findChatInput(), chatgpt);

  const claude = el('div', { contenteditable: 'true', 'data-placeholder': 'Message Claude' });
  const proseMirror = el('div', { contenteditable: 'true', class: 'ProseMirror' });
  const second = withDom([proseMirror, claude]);
  assert.equal(second.MigrationPromptEngine.findChatInput(), claude);
});

test('MigrationPromptEngine: findChatInput skips hidden candidates', () => {
  const hidden = el('textarea', { id: 'prompt-textarea', visible: false });
  const visible = el('textarea', { 'aria-label': 'Enter a prompt here' });
  const { MigrationPromptEngine } = withDom([hidden, visible]);

  assert.equal(MigrationPromptEngine.isVisible(hidden), false);
  assert.equal(MigrationPromptEngine.isVisible(visible), true);
  assert.equal(MigrationPromptEngine.findChatInput(), visible);
});

test('MigrationPromptEngine: findChatInput returns null on a page without inputs', () => {
  const { MigrationPromptEngine } = withDom([el('main', {}, [el('div', { text: 'loading' })])]);
  assert.equal(MigrationPromptEngine.findChatInput(), null);
});

test('MigrationPromptEngine: reports failure when the input rejects the update', () => {
  const textarea = el('textarea', {});
  textarea.dispatchEvent = () => {
    throw new Error('detached node');
  };
  const { MigrationPromptEngine, warnings } = withDom([textarea]);

  assert.equal(MigrationPromptEngine.injectPromptIntoInput(textarea), false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Failed injecting prompt/);
});

test('MigrationPromptEngine: leaves unsupported elements untouched', () => {
  const button = el('button', { text: 'Send' });
  const { MigrationPromptEngine } = withDom([button]);

  assert.equal(MigrationPromptEngine.injectPromptIntoInput(button), true);
  assert.equal(button.value, undefined);
  assert.equal(button.dispatchedEvents.length, 0);
});
