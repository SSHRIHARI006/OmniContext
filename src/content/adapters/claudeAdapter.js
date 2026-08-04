/**
 * OmniContext Claude Adapter
 * Scrapes Anthropic Claude conversations and detects Opus/Sonnet 4, 3.7, 3.5
 * models (200k context window). Model detection is two-phase (network
 * interceptor first, then resilient DOM scraping).
 */

import { BaseAdapter } from './baseAdapter.js';

export class ClaudeAdapter extends BaseAdapter {
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
    // 1. Stable data-testid / aria attributes first
    const selectors = [
      'button[data-testid="model-selector"]',
      '[data-testid*="model"]',
      'div[class*="ModelSelector"]',
      'div[class*="model-selector"]',
      'button[aria-haspopup="menu"]'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent) {
        const text = el.textContent.trim();
        if (/claude|opus|sonnet|haiku/i.test(text)) return text;
      }
    }

    // 2. Text-content matching in header / top nav
    const regions = document.querySelectorAll('header, nav, [class*="model"], [data-testid*="model"]');
    for (const region of regions) {
      const text = region.textContent ? region.textContent.trim() : '';
      const m = text.match(/(claude[^\s"]*|opus[^\s"]*|sonnet[^\s"]*|haiku[^\s"]*)/i);
      if (m) return m[0];
    }

    return 'Claude (default)';
  }

  extractMessages() {
    const messages = [];

    const selectors = [
      '.font-claude-message',
      '.user-message-block',
      '[data-is-streaming]',
      'div[class*="ChatMessage"]',
      '[data-testid*="user-message"]',
      '[data-testid*="assistant-message"]'
    ];

    const elements = this.getUniqueMessageElements([
      ...selectors,
      '[data-testid*="message"]',
      '[data-testid*="turn"]',
      'main [role="article"]',
      'main [role="listitem"]'
    ]);

    elements.forEach((el, index) => {
      let role = 'assistant';
      if (el.classList.contains('user-message-block') || el.querySelector('.user-message-block') ||
          (el.getAttribute('data-testid') || '').includes('user-message')) {
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
