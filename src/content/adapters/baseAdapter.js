/**
 * OmniContext Base Platform Adapter
 * Interface and utility functions for extracting LLM messages, roles, code
 * blocks, and model names. Per SPEC-1 §3.4, model detection is two-phase:
 * Phase 1 uses the network interceptor's captured API model ID, Phase 2
 * falls back to DOM scraping.
 */

class BaseAdapter {
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
   * Shared DOM model-name scrape (SPEC-1 §3.4 phase 2). Selector candidates
   * are tried first, then a looser text match over UI regions, then the
   * platform fallback name.
   * @param {Object} options
   * @param {string[]} options.selectors Stable data-testid / aria / class selectors.
   * @param {RegExp} [options.pattern] Candidate text must match when provided.
   * @param {string[]} [options.regionSelectors] Regions scanned for loose text matches.
   * @param {RegExp} [options.regionPattern] Extraction regex for region text.
   * @param {string} [options.fallback] Returned when nothing matches.
   * @returns {string}
   */
  scrapeModelName(options) {
    const { DomUtils } = OmniContext;
    const {
      selectors = [],
      pattern = null,
      regionSelectors = [],
      regionPattern = null,
      fallback = ''
    } = options;

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        const text = DomUtils.elementText(element);
        if (text && (!pattern || pattern.test(text))) return text;
      }
    }

    if (regionPattern) {
      for (const region of DomUtils.queryAll(regionSelectors)) {
        const match = DomUtils.elementText(region).match(regionPattern);
        if (match) return match[0];
      }
    }

    return fallback;
  }

  /**
   * Two-phase model resolution (SPEC-1 §3.4):
   * Phase 1 — check the network-intercepted API model ID.
   * Phase 2 — fall back to DOM scraping + registry match.
   * @returns {{ name: string, limit: number, platform: string, multiplier: number, source: string }}
   */
  getDetectedModel() {
    if (this._interceptedModelId) {
      const match = OmniContext.ModelRegistry.getModelByApiId(this._interceptedModelId);
      if (match) {
        return { ...match, source: 'network' };
      }
    }
    const scrapedText = this.extractModelName();
    return { ...OmniContext.ModelRegistry.getModelInfo(this.platformKey, scrapedText), source: 'dom' };
  }

  /**
   * Resolves model info and context limit.
   * @returns {{ name: string, limit: number, platform: string, multiplier: number }}
   */
  getModelInfo() {
    return this.getDetectedModel();
  }

  /**
   * Returns unique top-level message candidates from a selector cascade.
   * Nested selectors are removed when an already-selected ancestor contains
   * them, preventing one DOM message from being counted multiple times.
   * @param {string[]} selectors
   * @returns {HTMLElement[]}
   */
  getUniqueMessageElements(selectors) {
    const elements = [];
    const seen = new Set();

    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((element) => {
        if (seen.has(element)) return;
        seen.add(element);
        elements.push(element);
      });
    }

    return elements.filter((element) => !elements.some((other) => other !== element && other.contains(element)));
  }

  /**
   * Scrapes chat messages from the DOM.
   * @returns {Array<{ id: string, role: 'user'|'assistant', text: string, codeText: string, timestamp: number }>}
   */
  extractMessages() {
    return [];
  }

  /**
   * Builds message payloads from message elements, skipping empty ones.
   * @param {Iterable<HTMLElement>} elements
   * @param {Object} options
   * @param {string} options.idPrefix Prefix for synthesized message IDs.
   * @param {(element: HTMLElement) => string} options.resolveRole Anything
   *   other than 'user' is normalized to 'assistant'.
   * @param {boolean} [options.useElementId=true] Prefer the element's own id.
   * @returns {Array<{ id: string, role: 'user'|'assistant', text: string, codeText: string, timestamp: number }>}
   */
  buildMessages(elements, options) {
    const { idPrefix, resolveRole, useElementId = true } = options;
    const messages = [];

    Array.from(elements).forEach((element, index) => {
      const text = this.cleanElementText(element);
      if (!text) return;

      messages.push({
        id: (useElementId && element.id) || `${idPrefix}-${index}`,
        role: resolveRole(element) === 'user' ? 'user' : 'assistant',
        text,
        codeText: this.extractCodeText(element),
        timestamp: Date.now()
      });
    });

    return messages;
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
   * First element matching a selector cascade (earlier selectors win).
   * @param {string[]} selectors
   * @returns {HTMLElement|null}
   */
  queryFirst(selectors) {
    return OmniContext.DomUtils.queryFirst(selectors);
  }

  /**
   * Every element matching any selector, in document order.
   * @param {string[]} selectors
   * @returns {HTMLElement[]}
   */
  queryAll(selectors) {
    return OmniContext.DomUtils.queryAll(selectors);
  }

  /**
   * Elements of the first selector that yields any match.
   * @param {string[]} selectors
   * @returns {HTMLElement[]}
   */
  queryFirstNonEmpty(selectors) {
    return OmniContext.DomUtils.queryFirstNonEmpty(selectors);
  }

  /**
   * Locates the primary text input element in the chat interface.
   * @returns {HTMLElement|null}
   */
  getChatInput() {
    return this.queryFirst(['textarea', 'div[contenteditable="true"]']);
  }
}

OmniContext.BaseAdapter = BaseAdapter;
