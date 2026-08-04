/**
 * OmniContext Qwen Adapter
 * Scrapes Qwen Max / 2.5 conversations (128k context window).
 */

import { BaseAdapter } from './baseAdapter.js';

export class QwenAdapter extends BaseAdapter {
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
    const el = document.querySelector('.model-tag, .qwen-model');
    return el && el.textContent ? el.textContent.trim() : 'Qwen 2.5';
  }

  extractMessages() {
    const messages = [];
    const elements = document.querySelectorAll('.chat-item, .message-item');

    elements.forEach((el, index) => {
      const role = el.classList.contains('user') ? 'user' : 'assistant';
      const text = this.cleanElementText(el);
      const codeText = this.extractCodeText(el);

      if (text) {
        messages.push({
          id: `qwen-${index}`,
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
