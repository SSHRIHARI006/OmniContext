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
    const selectors = ['div[class*="model"]', '.model-select', 'header span'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent) {
        const text = el.textContent.trim();
        if (/deepseek|r1|v3/i.test(text)) return text;
      }
    }
    return 'DeepSeek (default)';
  }

  extractMessages() {
    const messages = [];
    const selectors = ['._user-message', '.ds-markdown', 'div[class*="chat-message"]'];
    const elements = document.querySelectorAll(selectors.join(', '));

    elements.forEach((el, index) => {
      let role = 'assistant';
      if (el.classList.contains('_user-message') || el.closest('._user-message')) {
        role = 'user';
      }

      const text = this.cleanElementText(el);
      const codeText = this.extractCodeText(el);

      if (text) {
        messages.push({
          id: el.id || `ds-msg-${index}`,
          role,
          text,
          codeText,
          timestamp: Date.now()
        });
      }
    });

    return messages;
  }

  getChatInput() {
    return document.querySelector('#chat-input') || document.querySelector('textarea');
  }
}

OmniContext.DeepSeekAdapter = DeepSeekAdapter;
