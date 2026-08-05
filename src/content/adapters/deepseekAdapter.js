/**
 * OmniContext DeepSeek Adapter
 * Scrapes DeepSeek V3 and DeepSeek R1 conversations (64k - 128k context window).
 */

class DeepSeekAdapter extends OmniContext.BaseAdapter {
  constructor() {
    super({
      platformKey: 'deepseek',
      hardLimitTokens: 128000, // DeepSeek V3 / R1 default limit
      tokenMultiplier: 1.10
    });
  }

  matches(hostname) {
    return /deepseek\.com/.test(hostname);
  }

  extractModelName() {
    return this.scrapeModelName({
      selectors: ['div[class*="model"]', '.model-select', 'header span'],
      pattern: /deepseek|r1|v3/i,
      fallback: 'DeepSeek (default)'
    });
  }

  extractMessages() {
    const elements = this.queryAll(['._user-message', '.ds-markdown', 'div[class*="chat-message"]']);

    return this.buildMessages(elements, {
      idPrefix: 'ds-msg',
      resolveRole: (el) => (
        el.classList.contains('_user-message') || el.closest('._user-message') ? 'user' : 'assistant'
      )
    });
  }

  getChatInput() {
    return this.queryFirst(['#chat-input', 'textarea']);
  }
}

OmniContext.DeepSeekAdapter = DeepSeekAdapter;
