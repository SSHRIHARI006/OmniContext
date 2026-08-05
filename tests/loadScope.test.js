/*
 * Classic scripts loaded into one realm (the content script isolated world and
 * the popup document) share a single global lexical scope. Two files declaring
 * the same top-level `class`/`const`/`let`/`function` name therefore abort the
 * second file with "Identifier X has already been declared", which silently
 * disables the HUD or the popup with only a console entry. These tests load the
 * real file sets and assert every file evaluates.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_MANIFEST = JSON.parse(readFileSync(join(ROOT, 'manifest.base.json'), 'utf8'));

function popupScripts() {
  const html = readFileSync(join(ROOT, 'src/popup/popup.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)]
    .map((match) => join('src/popup', match[1]));
}

function createStubContext() {
  const element = {
    id: '',
    checked: false,
    className: '',
    innerHTML: '',
    innerText: '',
    style: { setProperty() {}, display: '' },
    dataset: {},
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    remove() {},
    focus() {},
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getAttribute: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 })
  };
  element.attachShadow = () => ({ getElementById: () => element, innerHTML: '' });

  const document = {
    readyState: 'complete',
    body: element,
    documentElement: element,
    head: element,
    getElementById: () => element,
    createElement: () => element,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}
  };

  return vm.createContext({
    console,
    document,
    navigator: { userAgent: 'node', clipboard: { writeText: async () => {} } },
    window: { location: { hostname: 'example.com', href: 'https://example.com' }, addEventListener() {}, innerWidth: 1024, innerHeight: 768 },
    MutationObserver: class { observe() {} },
    Event: class {},
    InputEvent: class {},
    setTimeout,
    clearTimeout
  });
}

function loadAll(files) {
  const context = createStubContext();
  context.globalThis = context;
  for (const file of files) {
    vm.runInContext(readFileSync(join(ROOT, file), 'utf8'), context, { filename: file });
  }
  return context;
}

test('content script files load into a shared global scope without collisions', () => {
  const files = BASE_MANIFEST.content_scripts.flatMap((entry) => entry.js || []);
  assert.ok(files.length > 0);
  const context = loadAll(files);
  for (const exported of ['BaseAdapter', 'ChatGPTAdapter', 'GenericAdapter', 'ShadowContainer', 'ContentOrchestrator']) {
    assert.equal(typeof context.OmniContext[exported], 'function', exported);
  }
});

test('popup scripts load into a shared global scope without collisions', () => {
  const files = popupScripts();
  assert.ok(files.length > 0);
  const context = loadAll(files);
  assert.equal(typeof context.OmniContext.MetricsCalculator, 'function');
});
