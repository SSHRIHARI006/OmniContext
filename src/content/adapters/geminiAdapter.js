/**
 * OmniContext Gemini Adapter
 * Scrapes Google Gemini conversations and detects Gemini 2.5 Pro / Flash,
 * 2.0 Flash, 1.5 Pro / Flash models (1M - 2M context window).
 * Model detection is two-phase (network interceptor first, then resilient
 * DOM scraping).
 */

class GeminiAdapter extends OmniContext.BaseAdapter {
  constructor() {
    super({
      platformKey: 'gemini',
      hardLimitTokens: 1000000,
      tokenMultiplier: 1.05
    });
  }

  matches(hostname) {
    return /gemini\.google\.com/.test(hostname);
  }

  extractModelName() {
    return this.scrapeModelName({
      selectors: [
        '[data-test-id="model-picker-button"]',
        '[data-testid="model-picker-button"]',
        '.model-picker-button',
        'mat-select',
        '.model-title',
        '[aria-label*="Gemini"]',
        'button[aria-haspopup="menu"]'
      ],
      pattern: /flash|pro|gemini|thinking|2\.5|2\.0|1\.5/i,
      regionSelectors: ['header', 'nav', '[class*="model"]', '[data-test*="model"]'],
      regionPattern: /(gemini[^\s"]*|2\.5[^\s"]*pro|2\.5[^\s"]*flash|2\.0[^\s"]*flash|1\.5[^\s"]*)/i,
      fallback: 'Gemini (default)'
    });
  }

  extractMessages() {
    const elements = this.getUniqueMessageElements([
      'message-content',
      '.user-query',
      '.query-content',
      '.model-response-text',
      '.response-container',
      '[data-testid*="user-query"]',
      '[data-testid*="assistant-response"]',
      '[data-testid*="message"]',
      '[data-message-id]',
      'main [role="article"]',
      'main [role="listitem"]'
    ]);

    return this.buildMessages(elements, {
      idPrefix: 'gemini-msg',
      resolveRole: (el) => {
        const isUser = el.classList.contains('user-query') ||
          el.classList.contains('query-content') ||
          el.closest('.user-query-container') ||
          (el.getAttribute('data-testid') || '').includes('user-query');
        return isUser ? 'user' : 'assistant';
      }
    });
  }

  getChatInput() {
    return this.queryFirst([
      '.input-area textarea',
      'textarea[aria-label]',
      'div[contenteditable="true"]'
    ]);
  }
}

OmniContext.GeminiAdapter = GeminiAdapter;
