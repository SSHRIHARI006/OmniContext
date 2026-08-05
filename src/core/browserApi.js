/**
 * OmniContext Cross-Browser Extension API Helpers
 * Resolves the browser/chrome namespace once and wraps the storage, tab
 * messaging, and runtime messaging calls shared by the popup and the content
 * script. Every wrapper degrades gracefully when an API is unavailable (e.g.
 * the demo harness page) instead of throwing.
 */
(function (root) {
  'use strict';

  const OmniContext = root.OmniContext = root.OmniContext || {};
  const extensionApi = root.browser || root.chrome || null;

  class BrowserApi {
    /** @returns {Object|null} The browser/chrome namespace, when available. */
    static get api() {
      return extensionApi;
    }

    /** @returns {Object|null} */
    static get storage() {
      return extensionApi && extensionApi.storage ? extensionApi.storage.local || null : null;
    }

    /**
     * Reads a single local storage key.
     * @param {string} key
     * @param {*} [fallback] Returned when unset, unavailable, or on error.
     * @returns {Promise<*>}
     */
    static async getStoredValue(key, fallback) {
      const storage = BrowserApi.storage;
      if (!storage) return fallback;
      try {
        const result = await storage.get(key);
        return result && result[key] !== undefined ? result[key] : fallback;
      } catch (error) {
        return fallback;
      }
    }

    /**
     * Writes local storage values.
     * @param {Object} values
     * @returns {Promise<boolean>} Whether the write succeeded.
     */
    static async setStoredValues(values) {
      const storage = BrowserApi.storage;
      if (!storage) return false;
      try {
        await storage.set(values);
        return true;
      } catch (error) {
        return false;
      }
    }

    /**
     * Subscribes to local storage changes.
     * @param {(changes: Object) => void} listener
     * @returns {boolean} Whether the listener was registered.
     */
    static onStorageChanged(listener) {
      const onChanged = extensionApi && extensionApi.storage ? extensionApi.storage.onChanged : null;
      if (!onChanged) return false;
      onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') listener(changes);
      });
      return true;
    }

    /**
     * Subscribes to runtime messages.
     * @param {Function} listener
     * @returns {boolean} Whether the listener was registered.
     */
    static onRuntimeMessage(listener) {
      const onMessage = extensionApi && extensionApi.runtime ? extensionApi.runtime.onMessage : null;
      if (!onMessage) return false;
      onMessage.addListener(listener);
      return true;
    }

    /**
     * Fire-and-forget runtime message (rejections are swallowed: the
     * background worker may be asleep or the channel closed).
     * @param {Object} payload
     * @returns {boolean} Whether the message was dispatched.
     */
    static sendRuntimeMessage(payload) {
      const runtime = extensionApi ? extensionApi.runtime : null;
      if (!runtime || !runtime.sendMessage) return false;
      try {
        const result = runtime.sendMessage(payload);
        if (result && typeof result.catch === 'function') result.catch(() => {});
        return true;
      } catch (error) {
        return false;
      }
    }

    /**
     * Resolves the active tab of the current window.
     * @returns {Promise<Object|null>}
     */
    static async getActiveTab() {
      const tabs = extensionApi ? extensionApi.tabs : null;
      if (!tabs || !tabs.query) return null;
      try {
        const found = await tabs.query({ active: true, currentWindow: true });
        const activeTab = found && found[0];
        return activeTab && activeTab.id ? activeTab : null;
      } catch (error) {
        return null;
      }
    }

    /**
     * Sends a message to the active tab's content script.
     * @param {Object} message
     * @returns {Promise<{ ok: boolean, response: * }>} `ok` reports delivery,
     *   so callers can distinguish "no content script" from an empty reply.
     */
    static async sendMessageToActiveTab(message) {
      const activeTab = await BrowserApi.getActiveTab();
      if (!activeTab) return { ok: false, response: null };
      try {
        const response = await extensionApi.tabs.sendMessage(activeTab.id, message);
        return { ok: true, response: response !== undefined ? response : null };
      } catch (error) {
        return { ok: false, response: null };
      }
    }
  }

  OmniContext.BrowserApi = BrowserApi;
})(globalThis);
