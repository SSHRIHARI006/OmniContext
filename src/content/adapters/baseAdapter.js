/**
 * OmniContext Base Platform Adapter
 * Interface and utility functions for extracting LLM messages, roles, code blocks, and model names.
 */

import { ModelRegistry } from '../../core/modelRegistry.js';

export class BaseAdapter {
  constructor(config = {}) {
    this.platformKey = config.platformKey || 'generic';
    this.softLimitTokens = config.softLimitTokens || 128000;
    this.hardLimitTokens = config.hardLimitTokens || 1000000;
    this.tokenMultiplier = config.tokenMultiplier || 1.0;
  }

  /**
   * Tests whether this adapter handles the given URL hostname.
   * @param {string} hostname 
   * @returns {boolean}
   */
  matches(hostname) {
    return false;
  }

  /**
   * Locates the main chat message container element.
   * @returns {HTMLElement}
   */
  getChatContainer() {
    return document.querySelector('main') || document.body;
  }

  /**
   * Extracts model name text from the DOM if present.
   * @returns {string}
   */
  extractModelName() {
    return '';
  }

  /**
   * Gets resolved model info and context limit.
   * @returns {{ name: string, limit: number, softLimit: number, platform: string }}
   */
  getModelInfo() {
    const scrapedText = this.extractModelName();
    const info = ModelRegistry.getModelInfo(this.platformKey, scrapedText);
    return info;
  }

  /**
   * Scrapes chat messages from the DOM.
   * @returns {Array<{ id: string, role: 'user'|'assistant', text: string, codeText: string, timestamp: number }>}
   */
  extractMessages() {
    return [];
  }

  /**
   * Cleans an element's text by stripping UI buttons, SVGs, and hidden elements.
   * @param {HTMLElement} element 
   * @returns {string}
   */
  cleanElementText(element) {
    if (!element) return '';
    const clone = element.cloneNode(true);

    const selectorsToRemove = [
      'button',
      'svg',
      '.copy-button',
      '.action-buttons',
      '.sr-only',
      'style',
      'script',
      '[aria-hidden="true"]'
    ];

    selectorsToRemove.forEach(selector => {
      clone.querySelectorAll(selector).forEach(node => node.remove());
    });

    return clone.textContent ? clone.textContent.trim() : '';
  }

  /**
   * Extracts text from pre/code blocks inside a message element.
   * @param {HTMLElement} element 
   * @returns {string}
   */
  extractCodeText(element) {
    if (!element) return '';
    let codeContent = '';
    element.querySelectorAll('pre, code').forEach(block => {
      codeContent += ' ' + block.textContent;
    });
    return codeContent.trim();
  }

  /**
   * Locates the primary text input element in the chat interface.
   * @returns {HTMLElement|null}
   */
  getChatInput() {
    return document.querySelector('textarea, div[contenteditable="true"]');
  }
}
