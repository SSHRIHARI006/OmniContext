/**
 * OmniContext ChatGPT Adapter
 * Scrapes OpenAI ChatGPT conversations and detects GPT-4.1, GPT-4o, o1, o3,
 * o4-mini models. Model detection is two-phase (network interceptor first,
 * then resilient DOM scraping).
 */

class ChatGPTAdapter extends OmniContext.BaseAdapter {
  constructor() {
    super({
      platformKey: 'chatgpt',
      hardLimitTokens: 128000,
      tokenMultiplier: 1.00
    });
  }

  matches(hostname) {
    return /chatgpt\.com|chat\.openai\.com/.test(hostname);
  }

  extractModelName() {
    // 1. Stable data-testid / aria attributes first
    const selectors = [
      '[data-testid="model-switcher-dropdown-button"]',
      '[data-testid="model-switcher-button"]',
      'button[data-testid*="model"]',
      '[data-testid*="model-picker"]',
      'button[id^="radix-"]',
      '[aria-haspopup="menu"]',
      'div[class*="model-name"]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent) {
        const text = el.textContent.trim();
        if (/gpt|o1|o3|o4/i.test(text)) return text;
      }
    }

    // 2. Text-content matching near known UI regions
    const regions = document.querySelectorAll('header, nav, [class*="model"], [data-testid*="model"]');
    for (const region of regions) {
      const text = region.textContent ? region.textContent.trim() : '';
      const m = text.match(/(gpt-?4[^\s"]*|o[134]-?mini|o[134]|chatgpt[^\s"]*)/i);
      if (m) return m[0];
    }

    return 'ChatGPT (GPT-4o)';
  }

  extractMessages() {
    const messages = [];
    const elements = this.getUniqueMessageElements([
      '[data-message-author-role]',
      '[data-testid*="conversation-turn"]',
      '[data-testid*="message"]',
      'article',
      'main [role="listitem"]',
      'main [role="article"]'
    ]);

    elements.forEach((el, index) => {
      let role = el.getAttribute('data-message-author-role');
      if (!role) {
        if (el.querySelector('[data-message-author-role="user"]')) {
          role = 'user';
        } else {
          role = 'assistant';
        }
      }

      const text = this.cleanElementText(el);
      const codeText = this.extractCodeText(el);

      if (text) {
        messages.push({
          id: el.id || `cg-msg-${index}`,
          role: role === 'user' ? 'user' : 'assistant',
          text,
          codeText,
          timestamp: Date.now()
        });
      }
    });

    return messages;
  }

  getChatInput() {
    return document.querySelector('#prompt-textarea') || document.querySelector('textarea');
  }
}

OmniContext.ChatGPTAdapter = ChatGPTAdapter;
