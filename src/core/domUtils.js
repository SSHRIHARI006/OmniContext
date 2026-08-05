/**
 * OmniContext Shared DOM Utilities
 * Selector-cascade and text helpers shared by the platform adapters, the
 * migration prompt engine, and the overlay UI. Written as an IIFE so no
 * top-level identifiers leak into the shared content-script global scope.
 */
(function (root) {
  'use strict';

  const OmniContext = root.OmniContext = root.OmniContext || {};

  class DomUtils {
    /**
     * Returns true when the element occupies space in the layout.
     * @param {Element|null} element
     * @returns {boolean}
     */
    static isVisible(element) {
      if (!element) return false;
      return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    }

    /**
     * Trimmed textContent of an element ('' when absent).
     * @param {Element|null} element
     * @returns {string}
     */
    static elementText(element) {
      return element && element.textContent ? element.textContent.trim() : '';
    }

    /**
     * Returns the first element matching a selector cascade.
     * @param {string[]} selectors Tried in order; earlier selectors win.
     * @param {{ visibleOnly?: boolean, root?: ParentNode }} [options]
     * @returns {Element|null}
     */
    static queryFirst(selectors, options = {}) {
      const { visibleOnly = false, root: scope = document } = options;
      for (const selector of selectors) {
        for (const element of scope.querySelectorAll(selector)) {
          if (!visibleOnly || DomUtils.isVisible(element)) return element;
        }
      }
      return null;
    }

    /**
     * Returns every element matching any selector, in document order and
     * without duplicates.
     * @param {string[]} selectors
     * @param {ParentNode} [scope]
     * @returns {Element[]}
     */
    static queryAll(selectors, scope = document) {
      if (!selectors.length) return [];
      return Array.from(scope.querySelectorAll(selectors.join(', ')));
    }

    /**
     * Returns the elements matching the first selector that yields results.
     * @param {string[]} selectors
     * @param {ParentNode} [scope]
     * @returns {Element[]}
     */
    static queryFirstNonEmpty(selectors, scope = document) {
      for (const selector of selectors) {
        const found = scope.querySelectorAll(selector);
        if (found.length > 0) return Array.from(found);
      }
      return [];
    }
  }

  OmniContext.DomUtils = DomUtils;
})(globalThis);
