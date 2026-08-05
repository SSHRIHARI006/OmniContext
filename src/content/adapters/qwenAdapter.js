/**
 * OmniContext Qwen Adapter
 * Scrapes Qwen Max / 2.5 conversations (128k context window).
 */

class QwenAdapter extends OmniContext.BaseAdapter {
  constructor() {
    super({
      platformKey: 'qwen',
      hardLimitTokens: 128000,
      tokenMultiplier: 1.10
    });
  }

  matches(hostname) {
    return /aliyun\.com|qwenlm\.ai/.test(hostname);
  }

  extractModelName() {
    return this.scrapeModelName({
      selectors: ['.model-tag', '.qwen-model'],
      fallback: 'Qwen 2.5'
    });
  }

  extractMessages() {
    const elements = this.queryAll(['.chat-item', '.message-item']);

    return this.buildMessages(elements, {
      idPrefix: 'qwen',
      useElementId: false,
      resolveRole: (el) => (el.classList.contains('user') ? 'user' : 'assistant')
    });
  }
}

OmniContext.QwenAdapter = QwenAdapter;
