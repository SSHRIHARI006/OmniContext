/**
 * OmniContext Base Platform Adapter
 * Interface and utility functions for extracting LLM messages, roles, code
 * blocks, and model names. Per SPEC-1 §3.4, model detection is two-phase:
 * Phase 1 uses the network interceptor's captured API model ID, Phase 2
 * falls back to DOM scraping.
 */

import { ModelRegistry } from '../../core/modelRegistry.js';

export class BaseAdapter {
  constructor(config = {}) {
    this.platformKey = config.platformKey || 'generic';
    this.hardLimitTokens = config.hardLimitTokens || 128000;
    this.tokenMultiplier = config.tokenMultiplier || 1.0;
    this._interceptedModelId = null;
  }

  /**
   * Records a model ID captured by the network interceptor (main world).
   * @param {string} modelId
   */
  setInterceptedModel(modelId) {
    if (modelId && typeof modelId === 'string') {
      this._interceptedModelId = modelId;
    }
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
   * Two-phase model resolution (SPEC-1 §3.4):
   * Phase 1 — check the network-intercepted API model ID.
   * Phase 2 — fall back to DOM scraping + registry match.
   * @returns {{ name: string, limit: number, platform: string, multiplier: number, source: string }}
   */
  getDetectedModel() {
    if (this._interceptedModelId) {
      const match = ModelRegistry.getModelByApiId(this._interceptedModelId);
      if (match) {
        return { ...match, source: 'network' };
      }
    }
    const scrapedText = this.extractModelName();
    return { ...ModelRegistry.getModelInfo(this.platformKey, scrapedText), source: 'dom' };
  }

  /**
   * Resolves model info and context limit.
   * @returns {{ name: string, limit: number, platform: string, multiplier: number }}
   */
  getModelInfo() {
    return this.getDetectedModel();
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

    selectorsToRemove.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((node) => node.remove());
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
    element.querySelectorAll('pre, code').forEach((block) => {
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
