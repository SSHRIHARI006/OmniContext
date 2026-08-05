/**
 * OmniContext Generic Fallback Adapter
 * Fallback DOM extractor using heuristics for unrecognized LLM web UIs.
 */

class GenericAdapter extends OmniContext.BaseAdapter {
  constructor() {
    super({
      platformKey: 'generic',
      hardLimitTokens: 128000,
      tokenMultiplier: 1.00
    });
  }

  matches() {
    return true; // Always matches as fallback
  }

  extractMessages() {
    // Generic query selectors according to FR-1.2: article, [role="data-message"], .message, .chat-message
    let elements = this.queryFirstNonEmpty([
      'article',
      '[role="data-message"]',
      '.message',
      '.chat-message',
      '.msg',
      '.conversation-turn'
    ]);

    // If no specific message elements found, look for text blocks inside main
    if (elements.length === 0) {
      const main = this.getChatContainer();
      if (main) {
        elements = Array.from(main.querySelectorAll('div > p, section > div')).filter(el => el.textContent.length > 20);
      }
    }

    return this.buildMessages(elements, {
      idPrefix: 'gen-msg',
      resolveRole: (el) => {
        const className = (el.className || '').toString().toLowerCase();
        const dataset = JSON.stringify(el.dataset || {});
        const isUser = className.includes('user') || dataset.includes('user') ||
          el.getAttribute('data-role') === 'user';
        return isUser ? 'user' : 'assistant';
      }
    });
  }
}

OmniContext.GenericAdapter = GenericAdapter;
