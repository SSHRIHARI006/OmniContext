/**
 * OmniContext Kimi Adapter
 * Scrapes Kimi Moonshot conversations (128k - 2M context window).
 */

class KimiAdapter extends OmniContext.BaseAdapter {
  constructor() {
    super({
      platformKey: 'kimi',
      hardLimitTokens: 128000,
      tokenMultiplier: 1.10
    });
  }

  matches(hostname) {
    return /moonshot\.cn|kimi\.ai|kimi\.com/.test(hostname);
  }

  extractModelName() {
    return this.scrapeModelName({
      selectors: ['.model-select', '.k15-tag'],
      fallback: 'Kimi Moonshot'
    });
  }

  extractMessages() {
    const elements = this.queryAll(['.segment-content', '.chat-segment', '.chat-message']);

    return this.buildMessages(elements, {
      idPrefix: 'kimi',
      useElementId: false,
      resolveRole: (el) => (el.classList.contains('user') ? 'user' : 'assistant')
    });
  }
}

OmniContext.KimiAdapter = KimiAdapter;
