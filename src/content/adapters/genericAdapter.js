/**
 * OmniContext Generic Fallback Adapter
 * Fallback DOM extractor using heuristics for unrecognized LLM web UIs.
 */

import { BaseAdapter } from './baseAdapter.js';

export class GenericAdapter extends BaseAdapter {
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
    const messages = [];

    // Generic query selectors according to FR-1.2: article, [role="data-message"], .message, .chat-message
    const selectors = [
      'article',
      '[role="data-message"]',
      '.message',
      '.chat-message',
      '.msg',
      '.conversation-turn'
    ];

    let elements = [];
    for (const sel of selectors) {
      const found = document.querySelectorAll(sel);
      if (found && found.length > 0) {
        elements = Array.from(found);
        break;
      }
    }

    // If no specific message elements found, look for text blocks inside main
    if (elements.length === 0) {
      const main = this.getChatContainer();
      if (main) {
        elements = Array.from(main.querySelectorAll('div > p, section > div')).filter(el => el.textContent.length > 20);
      }
    }

    elements.forEach((el, index) => {
      let role = 'assistant';
      const className = (el.className || '').toString().toLowerCase();
      const dataset = JSON.stringify(el.dataset || {});

      if (className.includes('user') || dataset.includes('user') || el.getAttribute('data-role') === 'user') {
        role = 'user';
      }

      const text = this.cleanElementText(el);
      const codeText = this.extractCodeText(el);

      if (text.length > 0) {
        messages.push({
          id: el.id || `gen-msg-${index}`,
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
