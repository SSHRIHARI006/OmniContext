import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Minimal DOM stand-in: each element declares the selectors it matches, so
 * selector cascades and unions can be exercised without a DOM library.
 */
class FakeElement {
  constructor({ id = '', text = '', classes = [], attrs = {}, selectors = [], parent = null }) {
    this.id = id;
    this.text = text;
    this.classes = classes;
    this.attrs = attrs;
    this.selectors = selectors;
    this.parent = parent;
    this.children = [];
  }

  get textContent() {
    return this.text;
  }

  get classList() {
    return { contains: (name) => this.classes.includes(name) };
  }

  get dataset() {
    return {};
  }

  get className() {
    return this.classes.join(' ');
  }

  getAttribute(name) {
    return this.attrs[name] !== undefined ? this.attrs[name] : null;
  }

  querySelectorAll(selector) {
    return this.children.filter((child) => child.selectors.includes(selector));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.selectors.includes(selector)) return node;
      node = node.parent;
    }
    return null;
  }

  contains(other) {
    return this.children.includes(other);
  }

  cloneNode() {
    const text = this.text;
    return { textContent: text, querySelectorAll: () => [] };
  }
}

class FakeDocument {
  constructor(elements = []) {
    this.elements = elements;
    this.body = new FakeElement({ selectors: ['body'] });
  }

  querySelectorAll(selectorList) {
    const selectors = selectorList.split(',').map((part) => part.trim());
    return this.elements.filter((element) => element.selectors.some((own) => selectors.includes(own)));
  }

  querySelector(selectorList) {
    return this.querySelectorAll(selectorList)[0] || null;
  }
}

function loadOmniContext(document) {
  const context = vm.createContext({
    console,
    document,
    Set,
    Math,
    Date,
    String,
    Number,
    Array,
    Object,
    RegExp,
    JSON
  });

  for (const file of [
    'src/content/omniNamespace.js',
    'src/core/domUtils.js',
    'src/core/modelRegistry.js',
    'src/core/tokenEngine.js',
    'src/core/metricsCalculator.js',
    'src/core/metricsView.js',
    'src/content/adapters/baseAdapter.js',
    'src/content/adapters/chatgptAdapter.js',
    'src/content/adapters/kimiAdapter.js'
  ]) {
    vm.runInContext(readFileSync(join(ROOT, file), 'utf8'), context, { filename: file });
  }

  return context.OmniContext;
}

test('DomUtils: cascades prefer earlier selectors and unions all matches', () => {
  const first = new FakeElement({ text: 'first', selectors: ['.b'] });
  const second = new FakeElement({ text: 'second', selectors: ['.a'] });
  const { DomUtils } = loadOmniContext(new FakeDocument([first, second]));

  assert.equal(DomUtils.queryFirst(['.a', '.b']), second);
  assert.equal(DomUtils.queryFirst(['.missing', '.b']), first);
  assert.equal(DomUtils.queryFirst(['.missing']), null);
  assert.deepEqual([...DomUtils.queryAll(['.a', '.b'])], [first, second]);
  assert.deepEqual([...DomUtils.queryFirstNonEmpty(['.missing', '.a', '.b'])], [second]);
});

test('BaseAdapter.scrapeModelName: selector match, region fallback, then default', () => {
  const picker = new FakeElement({ text: 'GPT-4.1', selectors: ['[aria-haspopup="menu"]'] });
  const withPicker = loadOmniContext(new FakeDocument([picker]));
  assert.equal(new withPicker.ChatGPTAdapter().extractModelName(), 'GPT-4.1');

  // A picker whose text fails the /gpt|o1|o3|o4/ gate falls through to regions.
  const unrelatedPicker = new FakeElement({ text: 'Menu', selectors: ['[aria-haspopup="menu"]'] });
  const header = new FakeElement({ text: 'Chat with GPT-4o now', selectors: ['header'] });
  const withRegion = loadOmniContext(new FakeDocument([unrelatedPicker, header]));
  assert.equal(new withRegion.ChatGPTAdapter().extractModelName(), 'GPT-4o');

  const empty = loadOmniContext(new FakeDocument([]));
  assert.equal(new empty.ChatGPTAdapter().extractModelName(), 'ChatGPT (GPT-4o)');
});

test('BaseAdapter.buildMessages: roles, element ids, and empty-text skipping', () => {
  const user = new FakeElement({
    id: 'turn-1',
    text: 'How do I center a div?',
    attrs: { 'data-message-author-role': 'user' },
    selectors: ['[data-message-author-role]']
  });
  const assistant = new FakeElement({
    text: 'Use flexbox.',
    attrs: { 'data-message-author-role': 'assistant' },
    selectors: ['[data-message-author-role]']
  });
  const blank = new FakeElement({ text: '   ', selectors: ['[data-message-author-role]'] });
  const OmniContext = loadOmniContext(new FakeDocument([user, assistant, blank]));

  const messages = new OmniContext.ChatGPTAdapter().extractMessages();
  assert.equal(messages.length, 2);
  assert.deepEqual(
    JSON.parse(JSON.stringify(messages.map((message) => [message.id, message.role, message.text]))),
    [
      ['turn-1', 'user', 'How do I center a div?'],
      ['cg-msg-1', 'assistant', 'Use flexbox.']
    ]
  );
  assert.ok(messages.every((message) => typeof message.timestamp === 'number'));
});

test('Adapters opting out of element ids get fully synthesized ids', () => {
  const segment = new FakeElement({ id: 'ignored', text: 'Hello', selectors: ['.segment-content'] });
  const OmniContext = loadOmniContext(new FakeDocument([segment]));

  const messages = new OmniContext.KimiAdapter().extractMessages();
  assert.deepEqual([...messages.map((message) => message.id)], ['kimi-0']);
});

test('MetricsView: shared tiers, colors, and formatted token counts', () => {
  const OmniContext = loadOmniContext(new FakeDocument([]));
  const { MetricsView } = OmniContext;

  assert.equal(MetricsView.resolveHealthScore({ healthScore: 70, bloatScore: 20 }), 70);
  assert.equal(MetricsView.resolveHealthScore({ bloatScore: 20 }), 20);

  assert.equal(MetricsView.statusTier(90), 'bloated');
  assert.equal(MetricsView.statusTier(70), 'degrading');
  assert.equal(MetricsView.statusTier(50), 'dense');
  assert.equal(MetricsView.statusTier(10), 'optimal');
  assert.equal(MetricsView.statusColor('bloated'), MetricsView.STATUS_COLORS.bloated);
  assert.equal(MetricsView.statusColor('unknown'), MetricsView.STATUS_COLORS.optimal);

  assert.equal(MetricsView.capacityTier(81), 'high');
  assert.equal(MetricsView.capacityTier(51), 'medium');
  assert.equal(MetricsView.capacityTier(50), 'low');

  assert.deepEqual(
    { ...MetricsView.formatTokenCounts({ contextLimit: 1000000, totalTokens: 128000, remainingTokens: 872000 }) },
    { limit: '1M', total: '128k', remaining: '872k' }
  );
});
