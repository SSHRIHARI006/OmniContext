/**
 * OmniContext Claude Adapter
 * Scrapes Anthropic Claude 3 / 3.5 / 3.7 Sonnet conversations (200k context window).
 */

import { BaseAdapter } from './baseAdapter.js';

export class ClaudeAdapter extends BaseAdapter {
  constructor() {
    super({
      platformKey: 'claude',
      softLimitTokens: 200000, // Claude 3.5 / 3.7 Sonnet default limit
      hardLimitTokens: 200000,
      tokenMultiplier: 1.18
    });
  }

  matches(hostname) {
    return /claude\.ai/.test(hostname);
  }

  extractModelName() {
    const selectors = [
      'button[data-testid="model-selector"]',
      'div[class*="ModelSelector"]',
      'button[aria-haspopup="menu"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent) {
        const text = el.textContent.trim();
        if (/claude/i.test(text)) return text;
      }
    }
    return 'Claude 3.5 Sonnet';
  }

  extractMessages() {
    const messages = [];

    const selectors = [
      '.font-claude-message',
      '.user-message-block',
      '[data-is-streaming]',
      'div[class*="ChatMessage"]'
    ];

    const elements = document.querySelectorAll(selectors.join(', '));

    elements.forEach((el, index) => {
      let role = 'assistant';
      if (el.classList.contains('user-message-block') || el.querySelector('.user-message-block')) {
        role = 'user';
      }

      const text = this.cleanElementText(el);
      const codeText = this.extractCodeText(el);

      if (text) {
        messages.push({
          id: el.id || `claude-msg-${index}`,
          role,
          text,
          codeText,
          timestamp: Date.now()
        });
      }
    });

    return messages;
  }

  getChatInput() {
    return document.querySelector('fieldset div[contenteditable="true"]') ||
           document.querySelector('div[contenteditable="true"]');
  }
}
