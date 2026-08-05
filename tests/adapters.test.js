import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, el } from './helpers/fakeDom.js';
import { loadRuntime } from './helpers/loadRuntime.js';

const ADAPTER_SOURCES = [
  'src/core/modelRegistry.js',
  'src/content/adapters/baseAdapter.js',
  'src/content/adapters/chatgptAdapter.js',
  'src/content/adapters/claudeAdapter.js',
  'src/content/adapters/geminiAdapter.js',
  'src/content/adapters/deepseekAdapter.js',
  'src/content/adapters/kimiAdapter.js',
  'src/content/adapters/qwenAdapter.js',
  'src/content/adapters/genericAdapter.js'
];

/** Loads the adapter runtime against a fresh document double. */
function withDom(children = []) {
  const document = createDocument(children);
  const { OmniContext } = loadRuntime(ADAPTER_SOURCES, { document });
  return { document, ...OmniContext };
}

// Runtime values come from a vm realm, so plain arrays/objects are rebuilt in
// the test realm before deep comparisons.
function roles(messages) {
  return [...messages].map((message) => message.role);
}

function texts(messages) {
  return [...messages].map((message) => message.text);
}

function ids(messages) {
  return [...messages].map((message) => message.id);
}

test('BaseAdapter: exposes generic defaults and stub extractors', () => {
  const { BaseAdapter } = withDom();
  const adapter = new BaseAdapter();
  assert.equal(adapter.platformKey, 'generic');
  assert.equal(adapter.hardLimitTokens, 128000);
  assert.equal(adapter.tokenMultiplier, 1.0);
  assert.equal(adapter.matches('example.com'), false);
  assert.equal(adapter.extractModelName(), '');
  assert.deepEqual([...adapter.extractMessages()], []);
});

test('BaseAdapter: config overrides platform key, limit and multiplier', () => {
  const { BaseAdapter } = withDom();
  const adapter = new BaseAdapter({ platformKey: 'claude', hardLimitTokens: 200000, tokenMultiplier: 1.15 });
  assert.equal(adapter.platformKey, 'claude');
  assert.equal(adapter.hardLimitTokens, 200000);
  assert.equal(adapter.tokenMultiplier, 1.15);
});

test('BaseAdapter: getChatContainer prefers <main> and falls back to <body>', () => {
  const main = el('main');
  const withMain = withDom([main]);
  assert.equal(new withMain.BaseAdapter().getChatContainer(), main);

  const withoutMain = withDom([el('div')]);
  assert.equal(new withoutMain.BaseAdapter().getChatContainer(), withoutMain.document.body);
});

test('BaseAdapter: setInterceptedModel ignores blank and non-string ids', () => {
  const { BaseAdapter } = withDom();
  const adapter = new BaseAdapter({ platformKey: 'chatgpt' });
  for (const invalid of ['', null, undefined, 123, {}]) {
    adapter.setInterceptedModel(invalid);
    assert.equal(adapter._interceptedModelId, null, `for ${JSON.stringify(invalid)}`);
  }
  adapter.setInterceptedModel('gpt-4o-mini');
  assert.equal(adapter._interceptedModelId, 'gpt-4o-mini');
});

test('BaseAdapter: model detection uses the network id first, then DOM scraping', () => {
  const { BaseAdapter } = withDom();
  class ScrapingAdapter extends BaseAdapter {
    extractModelName() {
      return 'GPT-4o';
    }
  }

  const adapter = new ScrapingAdapter({ platformKey: 'chatgpt' });
  const scraped = adapter.getDetectedModel();
  assert.equal(scraped.source, 'dom');
  assert.equal(scraped.name, 'GPT-4o');
  assert.equal(scraped.limit, 128000);

  adapter.setInterceptedModel('o4-mini');
  const intercepted = adapter.getDetectedModel();
  assert.equal(intercepted.source, 'network');
  assert.equal(intercepted.name, 'o4-mini');
  assert.equal(intercepted.limit, 200000);
  assert.deepEqual({ ...adapter.getModelInfo() }, { ...intercepted });
});

test('BaseAdapter: unattributable network ids fall back to DOM detection', () => {
  const { BaseAdapter } = withDom();
  const adapter = new BaseAdapter({ platformKey: 'claude' });
  adapter.setInterceptedModel('internal-experiment-42');
  const model = adapter.getDetectedModel();
  assert.equal(model.source, 'dom');
  assert.equal(model.platform, 'claude');
});

test('BaseAdapter: getChatInput finds a textarea or contenteditable composer', () => {
  const textarea = el('textarea', {});
  const withTextarea = withDom([el('main', {}, [textarea])]);
  assert.equal(new withTextarea.BaseAdapter().getChatInput(), textarea);

  const editable = el('div', { contenteditable: 'true' });
  const withEditable = withDom([editable]);
  assert.equal(new withEditable.BaseAdapter().getChatInput(), editable);

  const withNeither = withDom([el('main', {})]);
  assert.equal(new withNeither.BaseAdapter().getChatInput(), null);
});

test('BaseAdapter: cleanElementText strips controls, icons and hidden nodes', () => {
  const message = el('div', {}, [
    el('p', { text: 'Visible answer text.' }),
    el('button', { text: 'Copy' }),
    el('svg', { text: 'icon' }),
    el('span', { class: 'sr-only', text: 'screen reader only' }),
    el('div', { class: 'action-buttons', text: 'Retry Share' }),
    el('span', { 'aria-hidden': 'true', text: 'decorative' }),
    el('style', { text: '.x{color:red}' }),
    el('script', { text: 'window.x=1' })
  ]);
  const { BaseAdapter } = withDom([message]);
  const adapter = new BaseAdapter();

  assert.equal(adapter.cleanElementText(message), 'Visible answer text.');
  assert.equal(adapter.cleanElementText(null), '');
  // cleaning operates on a clone, leaving the live DOM intact
  assert.equal(message.children.length, 8);
});

test('BaseAdapter: extractCodeText concatenates pre and code blocks only', () => {
  const message = el('div', {}, [
    el('p', { text: 'Try this:' }),
    el('pre', {}, [el('code', { text: 'const a = 1;' })]),
    el('code', { text: 'npm test' })
  ]);
  const { BaseAdapter } = withDom([message]);
  const adapter = new BaseAdapter();

  const code = adapter.extractCodeText(message);
  assert.match(code, /const a = 1;/);
  assert.match(code, /npm test/);
  assert.doesNotMatch(code, /Try this/);
  assert.equal(adapter.extractCodeText(null), '');
});

test('BaseAdapter: getUniqueMessageElements drops nested duplicates', () => {
  const inner = el('div', { class: 'message', text: 'inner' });
  const outer = el('article', {}, [inner]);
  const sibling = el('article', { text: 'sibling' });
  const { BaseAdapter } = withDom([outer, sibling]);

  const elements = new BaseAdapter().getUniqueMessageElements(['.message', 'article']);
  assert.deepEqual([...elements], [outer, sibling]);
});

test('BaseAdapter: getUniqueMessageElements dedupes elements matched twice', () => {
  const message = el('div', { class: 'message', 'data-testid': 'message-1', text: 'once' });
  const { BaseAdapter } = withDom([message]);

  const elements = new BaseAdapter().getUniqueMessageElements(['.message', '[data-testid="message-1"]']);
  assert.deepEqual([...elements], [message]);
});

test('ChatGPTAdapter: matches its hostnames only', () => {
  const { ChatGPTAdapter } = withDom();
  const adapter = new ChatGPTAdapter();
  assert.equal(adapter.platformKey, 'chatgpt');
  assert.ok(adapter.matches('chatgpt.com'));
  assert.ok(adapter.matches('chat.openai.com'));
  assert.equal(adapter.matches('claude.ai'), false);
});

test('ChatGPTAdapter: reads the model from the switcher, header, then default', () => {
  const switcher = withDom([
    el('button', { 'data-testid': 'model-switcher-dropdown-button', text: 'GPT-4.1' })
  ]);
  assert.equal(new switcher.ChatGPTAdapter().extractModelName(), 'GPT-4.1');

  const header = withDom([el('header', { text: 'ChatGPT o3-mini  Share' })]);
  assert.equal(new header.ChatGPTAdapter().extractModelName(), 'ChatGPT');

  const irrelevant = withDom([el('button', { 'data-testid': 'model-switcher-button', text: 'Choose' })]);
  assert.equal(new irrelevant.ChatGPTAdapter().extractModelName(), 'ChatGPT (GPT-4o)');
});

test('ChatGPTAdapter: extracts roles from data-message-author-role turns', () => {
  const { ChatGPTAdapter } = withDom([
    el('main', {}, [
      el('div', { 'data-message-author-role': 'user', id: 'turn-1', text: 'How do I sort an array?' }),
      el('div', { 'data-message-author-role': 'assistant', text: 'Use Array.prototype.sort.' }),
      el('div', { 'data-message-author-role': 'tool', text: 'tool output' })
    ])
  ]);

  const messages = new ChatGPTAdapter().extractMessages();
  assert.deepEqual(roles(messages), ['user', 'assistant', 'assistant']);
  assert.equal(messages[0].id, 'turn-1');
  assert.equal(messages[1].id, 'cg-msg-1');
  assert.ok(messages.every((message) => typeof message.timestamp === 'number'));
});

test('ChatGPTAdapter: infers the user role from a nested author marker', () => {
  const { ChatGPTAdapter } = withDom([
    el('main', {}, [
      el('div', { 'data-testid': 'conversation-turn-2' }, [
        el('div', { 'data-message-author-role': 'user', text: 'nested user text' })
      ])
    ])
  ]);

  const messages = new ChatGPTAdapter().extractMessages();
  assert.deepEqual(roles(messages), ['user']);
  assert.equal(messages.length, 1, 'nested author element must not be counted twice');
});

test('ChatGPTAdapter: skips empty turns and prefers #prompt-textarea for input', () => {
  const prompt = el('textarea', { id: 'prompt-textarea' });
  const { ChatGPTAdapter } = withDom([
    el('main', {}, [
      el('div', { 'data-message-author-role': 'assistant' }, [el('button', { text: 'Copy' })]),
      el('div', { 'data-message-author-role': 'user', text: 'real question' })
    ]),
    el('textarea', { placeholder: 'other' }),
    prompt
  ]);

  const adapter = new ChatGPTAdapter();
  assert.deepEqual(texts(adapter.extractMessages()), ['real question']);
  assert.equal(adapter.getChatInput(), prompt);
});

test('ChatGPTAdapter: treats unlabelled turns as assistant messages', () => {
  const { ChatGPTAdapter } = withDom([
    el('main', {}, [el('article', { text: 'Turn without an author role.' })])
  ]);

  const messages = new ChatGPTAdapter().extractMessages();
  assert.deepEqual(roles(messages), ['assistant']);
  assert.deepEqual(ids(messages), ['cg-msg-0']);
});

test('ChatGPTAdapter: falls back to any textarea when the prompt id is absent', () => {
  const fallback = el('textarea', { placeholder: 'Message ChatGPT' });
  const { ChatGPTAdapter } = withDom([fallback]);
  assert.equal(new ChatGPTAdapter().getChatInput(), fallback);
});

test('ClaudeAdapter: matches claude.ai and defaults its limits', () => {
  const { ClaudeAdapter } = withDom();
  const adapter = new ClaudeAdapter();
  assert.ok(adapter.matches('claude.ai'));
  assert.equal(adapter.matches('chatgpt.com'), false);
  assert.equal(adapter.hardLimitTokens, 200000);
  assert.equal(adapter.tokenMultiplier, 1.15);
});

test('ClaudeAdapter: reads the model selector, header, then default', () => {
  const selector = withDom([
    el('button', { 'data-testid': 'model-selector', text: 'Claude Sonnet 4' })
  ]);
  assert.equal(new selector.ClaudeAdapter().extractModelName(), 'Claude Sonnet 4');

  const header = withDom([el('nav', { text: 'Chats opus-4.1 Projects' })]);
  assert.equal(new header.ClaudeAdapter().extractModelName(), 'opus-4.1');

  const empty = withDom([el('button', { 'data-testid': 'model-selector', text: 'Select' })]);
  assert.equal(new empty.ClaudeAdapter().extractModelName(), 'Claude (default)');
});

test('ClaudeAdapter: distinguishes user blocks from Claude messages', () => {
  const { ClaudeAdapter } = withDom([
    el('main', {}, [
      el('div', { class: 'user-message-block', text: 'What is a monad?' }),
      el('div', { class: 'font-claude-message', text: 'A monad is a design pattern.' }),
      el('div', { 'data-testid': 'user-message-3', text: 'Thanks!' })
    ])
  ]);

  // Messages come back in selector-cascade order, not document order.
  const messages = new ClaudeAdapter().extractMessages();
  assert.deepEqual(roles(messages), ['assistant', 'user', 'user']);
  assert.deepEqual(texts(messages), ['A monad is a design pattern.', 'What is a monad?', 'Thanks!']);
});

test('ClaudeAdapter: prefers the fieldset composer for input', () => {
  const composer = el('div', { contenteditable: 'true', class: 'ProseMirror' });
  const { ClaudeAdapter } = withDom([
    el('div', { contenteditable: 'true', class: 'other' }),
    el('fieldset', {}, [el('div', {}, [composer])])
  ]);
  assert.equal(new ClaudeAdapter().getChatInput(), composer);
});

test('ClaudeAdapter: falls back to a bare contenteditable composer', () => {
  const editable = el('div', { contenteditable: 'true' });
  const { ClaudeAdapter } = withDom([editable]);
  assert.equal(new ClaudeAdapter().getChatInput(), editable);
});

test('GeminiAdapter: matches gemini.google.com with 1M defaults', () => {
  const { GeminiAdapter } = withDom();
  const adapter = new GeminiAdapter();
  assert.ok(adapter.matches('gemini.google.com'));
  assert.equal(adapter.matches('bard.google.com'), false);
  assert.equal(adapter.hardLimitTokens, 1000000);
  assert.equal(adapter.tokenMultiplier, 1.05);
});

test('GeminiAdapter: scans every picker candidate before falling back', () => {
  const picker = withDom([
    el('mat-select', { text: 'Choose' }),
    el('mat-select', { text: '2.5 Flash' })
  ]);
  assert.equal(new picker.GeminiAdapter().extractModelName(), '2.5 Flash');

  const header = withDom([el('header', { text: 'Gemini-2.5-Pro' })]);
  assert.equal(new header.GeminiAdapter().extractModelName(), 'Gemini-2.5-Pro');

  const empty = withDom([el('div', { class: 'model-title', text: 'Untitled' })]);
  assert.equal(new empty.GeminiAdapter().extractModelName(), 'Gemini (default)');
});

test('GeminiAdapter: marks queries as user turns and responses as assistant', () => {
  const { GeminiAdapter } = withDom([
    el('main', {}, [
      el('div', { class: 'user-query', text: 'Summarize this paper.' }),
      el('div', { class: 'model-response-text', text: 'The paper argues that...' }),
      el('div', { class: 'user-query-container' }, [
        el('div', { 'data-message-id': 'm3', text: 'And the limitations?' })
      ])
    ])
  ]);

  const messages = new GeminiAdapter().extractMessages();
  assert.deepEqual(roles(messages), ['user', 'assistant', 'user']);
  assert.equal(messages[2].id, 'gemini-msg-2');
});

test('GeminiAdapter: falls back through composer selectors for input', () => {
  const labelled = el('textarea', { 'aria-label': 'Enter a prompt here' });
  const withLabel = withDom([labelled]);
  assert.equal(new withLabel.GeminiAdapter().getChatInput(), labelled);

  const editable = el('div', { contenteditable: 'true' });
  const withEditable = withDom([editable]);
  assert.equal(new withEditable.GeminiAdapter().getChatInput(), editable);
});

test('DeepSeekAdapter: matches deepseek.com and scrapes its model label', () => {
  const { DeepSeekAdapter } = withDom([el('div', { class: 'model-select', text: 'DeepSeek-R1' })]);
  const adapter = new DeepSeekAdapter();
  assert.ok(adapter.matches('chat.deepseek.com'));
  assert.equal(adapter.matches('kimi.ai'), false);
  assert.equal(adapter.extractModelName(), 'DeepSeek-R1');
  assert.equal(adapter.tokenMultiplier, 1.1);

  const unlabelled = withDom([el('header', {}, [el('span', { text: 'New chat' })])]);
  assert.equal(new unlabelled.DeepSeekAdapter().extractModelName(), 'DeepSeek (default)');
});

test('DeepSeekAdapter: derives roles from user message wrappers', () => {
  const { DeepSeekAdapter } = withDom([
    el('div', { class: '_user-message', text: 'Explain gradient descent.' }),
    el('div', { class: 'ds-markdown', text: 'Gradient descent minimizes a loss function.' })
  ]);

  const messages = new DeepSeekAdapter().extractMessages();
  assert.deepEqual(roles(messages), ['user', 'assistant']);
  assert.equal(messages[0].id, 'ds-msg-0');
});

test('DeepSeekAdapter: prefers #chat-input for the composer', () => {
  const chatInput = el('textarea', { id: 'chat-input' });
  const { DeepSeekAdapter } = withDom([el('textarea', {}), chatInput]);
  assert.equal(new DeepSeekAdapter().getChatInput(), chatInput);
});

test('DeepSeekAdapter: falls back to any textarea for the composer', () => {
  const fallback = el('textarea', { placeholder: 'Message DeepSeek' });
  const { DeepSeekAdapter } = withDom([fallback]);
  assert.equal(new DeepSeekAdapter().getChatInput(), fallback);
});

test('KimiAdapter: matches its hostnames and reads the model tag', () => {
  const { KimiAdapter } = withDom([el('div', { class: 'k15-tag', text: 'Kimi k1.5' })]);
  const adapter = new KimiAdapter();
  for (const host of ['kimi.moonshot.cn', 'kimi.ai', 'www.kimi.com']) {
    assert.ok(adapter.matches(host), host);
  }
  assert.equal(adapter.matches('qwenlm.ai'), false);
  assert.equal(adapter.extractModelName(), 'Kimi k1.5');

  const untagged = withDom([]);
  assert.equal(new untagged.KimiAdapter().extractModelName(), 'Kimi Moonshot');
});

test('KimiAdapter: extracts segment messages with class-based roles', () => {
  const { KimiAdapter } = withDom([
    el('div', { class: 'chat-segment user', text: 'Translate this page.' }),
    el('div', { class: 'segment-content', text: 'Here is the translation.' }),
    el('div', { class: 'chat-message' }, [el('button', { text: 'Copy' })])
  ]);

  const messages = new KimiAdapter().extractMessages();
  assert.deepEqual(roles(messages), ['user', 'assistant']);
  assert.deepEqual(ids(messages), ['kimi-0', 'kimi-1']);
});

test('QwenAdapter: matches its hostnames and reads the model tag', () => {
  const { QwenAdapter } = withDom([el('span', { class: 'model-tag', text: 'Qwen 3' })]);
  const adapter = new QwenAdapter();
  assert.ok(adapter.matches('tongyi.aliyun.com'));
  assert.ok(adapter.matches('chat.qwenlm.ai'));
  assert.equal(adapter.matches('deepseek.com'), false);
  assert.equal(adapter.extractModelName(), 'Qwen 3');

  const untagged = withDom([]);
  assert.equal(new untagged.QwenAdapter().extractModelName(), 'Qwen 2.5');
});

test('QwenAdapter: extracts chat items with class-based roles', () => {
  const { QwenAdapter } = withDom([
    el('div', { class: 'chat-item user', text: 'Write a haiku.' }),
    el('div', { class: 'message-item', text: 'Silent autumn rain' })
  ]);

  const messages = new QwenAdapter().extractMessages();
  assert.deepEqual(roles(messages), ['user', 'assistant']);
  assert.deepEqual(ids(messages), ['qwen-0', 'qwen-1']);
});

test('GenericAdapter: matches any host and resolves a generic model', () => {
  const { GenericAdapter } = withDom();
  const adapter = new GenericAdapter();
  assert.ok(adapter.matches('some-new-llm.example'));
  assert.equal(adapter.getDetectedModel().name, 'Generic Model');
  assert.equal(adapter.getDetectedModel().source, 'dom');
});

test('GenericAdapter: uses the first selector tier that yields elements', () => {
  const { GenericAdapter } = withDom([
    el('main', {}, [
      el('article', { class: 'user-turn', text: 'Question from the user.' }),
      el('article', { text: 'Answer from the assistant.' }),
      el('div', { class: 'message', text: 'ignored lower-priority tier' })
    ])
  ]);

  const messages = new GenericAdapter().extractMessages();
  assert.deepEqual(roles(messages), ['user', 'assistant']);
  assert.deepEqual(texts(messages), ['Question from the user.', 'Answer from the assistant.']);
});

test('GenericAdapter: detects user turns via data attributes', () => {
  const { GenericAdapter } = withDom([
    el('div', { class: 'message', 'data-role': 'user', text: 'attribute-tagged user' }),
    el('div', { class: 'message', 'data-author': 'user-42', text: 'dataset-tagged user' }),
    el('div', { class: 'message', text: 'assistant reply' })
  ]);

  assert.deepEqual(roles(new GenericAdapter().extractMessages()), ['user', 'user', 'assistant']);
});

test('GenericAdapter: falls back to long text blocks inside the container', () => {
  const { GenericAdapter } = withDom([
    el('main', {}, [
      el('div', {}, [el('p', { text: 'This paragraph is long enough to count as a message.' })]),
      el('div', {}, [el('p', { text: 'too short' })])
    ])
  ]);

  const messages = new GenericAdapter().extractMessages();
  assert.deepEqual(texts(messages), ['This paragraph is long enough to count as a message.']);
  assert.deepEqual(ids(messages), ['gen-msg-0']);
});

test('GenericAdapter: returns no messages for an empty page', () => {
  const { GenericAdapter } = withDom([el('main', {})]);
  assert.deepEqual([...new GenericAdapter().extractMessages()], []);
});
