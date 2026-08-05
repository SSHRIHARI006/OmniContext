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
    return this.scrapeModelName({
      selectors: [
        '[data-testid="model-switcher-dropdown-button"]',
        '[data-testid="model-switcher-button"]',
        'button[data-testid*="model"]',
        '[data-testid*="model-picker"]',
        'button[id^="radix-"]',
        '[aria-haspopup="menu"]',
        'div[class*="model-name"]'
      ],
      pattern: /gpt|o1|o3|o4/i,
      regionSelectors: ['header', 'nav', '[class*="model"]', '[data-testid*="model"]'],
      regionPattern: /(gpt-?4[^\s"]*|o[134]-?mini|o[134]|chatgpt[^\s"]*)/i,
      fallback: 'ChatGPT (GPT-4o)'
    });
  }

  extractMessages() {
    const elements = this.getUniqueMessageElements([
      '[data-message-author-role]',
      '[data-testid*="conversation-turn"]',
      '[data-testid*="message"]',
      'article',
      'main [role="listitem"]',
      'main [role="article"]'
    ]);

    return this.buildMessages(elements, {
      idPrefix: 'cg-msg',
      resolveRole: (el) => el.getAttribute('data-message-author-role') ||
        (el.querySelector('[data-message-author-role="user"]') ? 'user' : 'assistant')
    });
  }

  getChatInput() {
    return this.queryFirst(['#prompt-textarea', 'textarea']);
  }
}

OmniContext.ChatGPTAdapter = ChatGPTAdapter;
