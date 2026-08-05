/**
 * OmniContext Claude Adapter
 * Scrapes Anthropic Claude conversations and detects Opus/Sonnet 4, 3.7, 3.5
 * models (200k context window). Model detection is two-phase (network
 * interceptor first, then resilient DOM scraping).
 */

class ClaudeAdapter extends OmniContext.BaseAdapter {
  constructor() {
    super({
      platformKey: 'claude',
      hardLimitTokens: 200000,
      tokenMultiplier: 1.15
    });
  }

  matches(hostname) {
    return /claude\.ai/.test(hostname);
  }

  extractModelName() {
    return this.scrapeModelName({
      selectors: [
        'button[data-testid="model-selector"]',
        '[data-testid*="model"]',
        'div[class*="ModelSelector"]',
        'div[class*="model-selector"]',
        'button[aria-haspopup="menu"]'
      ],
      pattern: /claude|opus|sonnet|haiku/i,
      regionSelectors: ['header', 'nav', '[class*="model"]', '[data-testid*="model"]'],
      regionPattern: /(claude[^\s"]*|opus[^\s"]*|sonnet[^\s"]*|haiku[^\s"]*)/i,
      fallback: 'Claude (default)'
    });
  }

  extractMessages() {
    const elements = this.getUniqueMessageElements([
      '.font-claude-message',
      '.user-message-block',
      '[data-is-streaming]',
      'div[class*="ChatMessage"]',
      '[data-testid*="user-message"]',
      '[data-testid*="assistant-message"]',
      '[data-testid*="message"]',
      '[data-testid*="turn"]',
      'main [role="article"]',
      'main [role="listitem"]'
    ]);

    return this.buildMessages(elements, {
      idPrefix: 'claude-msg',
      resolveRole: (el) => {
        const isUser = el.classList.contains('user-message-block') ||
          el.querySelector('.user-message-block') ||
          (el.getAttribute('data-testid') || '').includes('user-message');
        return isUser ? 'user' : 'assistant';
      }
    });
  }

  getChatInput() {
    return this.queryFirst([
      'fieldset div[contenteditable="true"]',
      'div[contenteditable="true"]'
    ]);
  }
}

OmniContext.ClaudeAdapter = ClaudeAdapter;
