/**
 * OmniContext Gemini Adapter
 * Scrapes Google Gemini conversations and detects Gemini 2.5 Pro / Flash,
 * 2.0 Flash, 1.5 Pro / Flash models (1M - 2M context window).
 * Model detection is two-phase (network interceptor first, then resilient
 * DOM scraping).
 */

import { BaseAdapter } from './baseAdapter.js';

export class GeminiAdapter extends BaseAdapter {
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
    // 1. Stable data-test-id / aria attributes first
    const selectors = [
      '[data-test-id="model-picker-button"]',
      '[data-testid="model-picker-button"]',
      '.model-picker-button',
      'mat-select',
      '.model-title',
      '[aria-label*="Gemini"]',
      'button[aria-haspopup="menu"]'
    ];

    for (const sel of selectors) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        const text = el.textContent ? el.textContent.trim() : '';
        if (/flash|pro|gemini|thinking|2\.5|2\.0|1\.5/i.test(text)) {
          return text;
        }
      }
    }

    // 2. Text-content matching in header
    const regions = document.querySelectorAll('header, nav, [class*="model"], [data-test*="model"]');
    for (const region of regions) {
      const text = region.textContent ? region.textContent.trim() : '';
      const m = text.match(/(gemini[^\s"]*|2\.5[^\s"]*pro|2\.5[^\s"]*flash|2\.0[^\s"]*flash|1\.5[^\s"]*)/i);
      if (m) return m[0];
    }

    return 'Gemini (default)';
  }

  extractMessages() {
    const messages = [];

    const querySelectors = [
      'message-content',
      '.user-query',
      '.query-content',
      '.model-response-text',
      '.response-container',
      '[data-testid*="user-query"]',
      '[data-testid*="assistant-response"]'
    ];

    const elements = document.querySelectorAll(querySelectors.join(', '));

    elements.forEach((el, index) => {
      let role = 'assistant';
      if (el.classList.contains('user-query') || el.classList.contains('query-content') ||
          el.closest('.user-query-container') || (el.getAttribute('data-testid') || '').includes('user-query')) {
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
