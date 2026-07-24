/**
 * OmniContext Kimi Adapter
 * Scrapes Kimi Moonshot conversations (128k - 2M context window).
 */

import { BaseAdapter } from './baseAdapter.js';

export class KimiAdapter extends BaseAdapter {
  constructor() {
    super({
      platformKey: 'kimi',
      softLimitTokens: 128000,
      hardLimitTokens: 2000000,
      tokenMultiplier: 1.10
    });
  }

  matches(hostname) {
    return /moonshot\.cn|kimi\.ai/.test(hostname);
  }

  extractModelName() {
    const el = document.querySelector('.model-select, .k15-tag');
    return el && el.textContent ? el.textContent.trim() : 'Kimi Moonshot';
  }

  extractMessages() {
    const messages = [];
    const elements = document.querySelectorAll('.segment-content, .chat-segment, .chat-message');

    elements.forEach((el, index) => {
      const role = el.classList.contains('user') ? 'user' : 'assistant';
      const text = this.cleanElementText(el);
      const codeText = this.extractCodeText(el);

      if (text) {
        messages.push({
          id: `kimi-${index}`,
          role,
          text,
          codeText,
          timestamp: Date.now()
        });
      }
    });

    return messages;
  }
}
