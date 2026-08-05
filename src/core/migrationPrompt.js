/**
 * OmniContext Migration Prompt Engine
 * Provides structured migration prompt generation and insertion logic into LLM web UI input textareas/contenteditables.
 */

const MIGRATION_PROMPT_TEXT = 
  "We are reaching memory context limits in this session. Please generate a structured Markdown summary of our discussion, including: key requirements, established architectural decisions, ongoing tasks, and critical code snippets so I can paste it into a fresh session.";

class MigrationPromptEngine {
  /**
   * Returns standard structured summary prompt text.
   * @returns {string}
   */
  static getPromptText() {
    return MIGRATION_PROMPT_TEXT;
  }

  /**
   * Injects the migration prompt into the platform's chat input element.
   * @param {Element|null} inputContainer 
   * @returns {boolean} Success status
   */
  static injectPromptIntoInput(inputElement) {
    if (!inputElement) {
      inputElement = this.findChatInput();
    }

    if (!inputElement) {
      console.warn('[OmniContext] Could not find input element to inject summary prompt.');
      return false;
    }

    try {
      if (inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT') {
        inputElement.value = MIGRATION_PROMPT_TEXT;
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        inputElement.focus();
      } else if (inputElement.isContentEditable || inputElement.getAttribute('contenteditable') === 'true') {
        inputElement.focus();
        // Clear existing content or insert text cleanly
        inputElement.innerText = MIGRATION_PROMPT_TEXT;
        inputElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: MIGRATION_PROMPT_TEXT }));
      }
      return true;
    } catch (err) {
      console.error('[OmniContext] Failed injecting prompt:', err);
      return false;
    }
  }

  /**
   * Locates chat prompt input element across all major providers.
   * @returns {HTMLElement|null}
   */
  static findChatInput() {
    return OmniContext.DomUtils.queryFirst([
      '#prompt-textarea',                              // ChatGPT
      'div[contenteditable="true"][data-placeholder]',  // Claude / General
      '.ProseMirror[contenteditable="true"]',           // Claude / DeepSeek
      'textarea[aria-label]',                          // Gemini / DeepSeek
      'div[contenteditable="true"]',                   // Generic contenteditable
      'textarea[placeholder]',                          // Generic textareas
      'textarea'
    ], { visibleOnly: true });
  }

  static isVisible(el) {
    return OmniContext.DomUtils.isVisible(el);
  }
}

OmniContext.MIGRATION_PROMPT_TEXT = MIGRATION_PROMPT_TEXT;
OmniContext.MigrationPromptEngine = MigrationPromptEngine;
