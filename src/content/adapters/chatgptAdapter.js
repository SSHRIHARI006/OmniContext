/**
 * OmniContext ChatGPT Adapter
 * Scrapes OpenAI ChatGPT conversations and detects GPT-4o, o1, o3-mini models (128k context window).
 */

import { BaseAdapter } from './baseAdapter.js';

export class ChatGPTAdapter extends BaseAdapter {
  constructor() {
    super({
      platformKey: 'chatgpt',
      softLimitTokens: 128000, // GPT-4o / o1 default context limit
      hardLimitTokens: 128000,
      tokenMultiplier: 1.00
    });
  }

  matches(hostname) {
    return /chatgpt\.com|chat\.openai\.com/.test(hostname);
  }

  extractModelName() {
    const selectors = [
      '[data-testid="model-switcher-dropdown-button"]',
      'button[id^="radix-"]',
      '[aria-haspopup="menu"]',
      'div[class*="model-name"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent) {
        const text = el.textContent.trim();
        if (/gpt|o1|o3/i.test(text)) return text;
      }
    }
    return 'GPT-4o';
  }

  extractMessages() {
    const messages = [];
    const elements = document.querySelectorAll('[data-message-author-role], article');

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
