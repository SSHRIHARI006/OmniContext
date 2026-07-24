/**
 * OmniContext Gemini Adapter
 * Scrapes Google Gemini conversations and detects Gemini 1.5 / 2.0 Flash / Pro models (1M - 2M context window).
 */

import { BaseAdapter } from './baseAdapter.js';

export class GeminiAdapter extends BaseAdapter {
  constructor() {
    super({
      platformKey: 'gemini',
      softLimitTokens: 1000000, // Gemini default 1,000,000 (1M) context limit
      hardLimitTokens: 2000000,
      tokenMultiplier: 1.05
    });
  }

  matches(hostname) {
    return /gemini\.google\.com/.test(hostname);
  }

  extractModelName() {
    const selectors = [
      '.model-picker-button',
      '[data-test-id="model-picker-button"]',
      'mat-select',
      '.model-title',
      '[aria-label*="Gemini"]',
      'button[aria-haspopup="menu"]',
      '.input-area button',
      'button'
    ];
    for (const sel of selectors) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        const text = el.textContent ? el.textContent.trim() : '';
        if (/flash|pro|gemini|thinking|1\.5|2\.0/i.test(text)) {
          return text;
        }
      }
    }
    return 'Gemini 1.5 Flash';
  }

  extractMessages() {
    const messages = [];

    const querySelectors = [
      'message-content',
      '.user-query',
      '.query-content',
      '.model-response-text',
      '.response-container'
    ];

    const elements = document.querySelectorAll(querySelectors.join(', '));

    elements.forEach((el, index) => {
      let role = 'assistant';
      if (el.classList.contains('user-query') || el.classList.contains('query-content') || el.closest('.user-query-container')) {
        role = 'user';
      }

      const text = this.cleanElementText(el);
      const codeText = this.extractCodeText(el);

      if (text) {
        messages.push({
          id: el.id || `gemini-msg-${index}`,
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
    return document.querySelector('.input-area textarea') ||
           document.querySelector('textarea[aria-label]') ||
           document.querySelector('div[contenteditable="true"]');
  }
}
