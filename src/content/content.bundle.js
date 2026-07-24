/**
 * OmniContext Bundled Content Script (Cross-Browser MV3 with Real-time Storage Sync ON/OFF Toggle)
 * All-in-one execution bundle with ON/OFF toggle switch, dynamic model context resolution, and clean minimal Shadow DOM HUD.
 */

(function () {
  'use strict';

  const extApi = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);

  // 1. MODEL REGISTRY
  class ModelRegistry {
    static MODELS = [
      // Gemini Models (1M - 2M tokens)
      { pattern: /gemini.*1\.5.*pro|pro/i, name: 'Gemini 1.5 Pro', limit: 2000000, softLimit: 2000000, platform: 'gemini' },
      { pattern: /gemini.*2\.0/i, name: 'Gemini 2.0 Flash', limit: 1000000, softLimit: 1000000, platform: 'gemini' },
      { pattern: /gemini.*1\.5|flash/i, name: 'Gemini 1.5 Flash', limit: 1000000, softLimit: 1000000, platform: 'gemini' },
      { pattern: /gemini/i, name: 'Gemini 1.5 / 2.0', limit: 1000000, softLimit: 1000000, platform: 'gemini' },

      // OpenAI / ChatGPT Models (128k tokens)
      { pattern: /gpt-4o-mini/i, name: 'GPT-4o mini', limit: 128000, softLimit: 128000, platform: 'chatgpt' },
      { pattern: /gpt-4o/i, name: 'GPT-4o', limit: 128000, softLimit: 128000, platform: 'chatgpt' },
      { pattern: /o1-mini/i, name: 'o1-mini', limit: 128000, softLimit: 128000, platform: 'chatgpt' },
      { pattern: /o1/i, name: 'o1', limit: 128000, softLimit: 128000, platform: 'chatgpt' },
      { pattern: /o3-mini/i, name: 'o3-mini', limit: 128000, softLimit: 128000, platform: 'chatgpt' },
      { pattern: /gpt-4/i, name: 'GPT-4', limit: 32000, softLimit: 32000, platform: 'chatgpt' },
      { pattern: /gpt-3\.5/i, name: 'GPT-3.5', limit: 16000, softLimit: 16000, platform: 'chatgpt' },
      { pattern: /chatgpt/i, name: 'ChatGPT (GPT-4o)', limit: 128000, softLimit: 128000, platform: 'chatgpt' },

      // Claude Models (200k tokens)
      { pattern: /claude.*3\.7/i, name: 'Claude 3.7 Sonnet', limit: 200000, softLimit: 200000, platform: 'claude' },
      { pattern: /claude.*3\.5.*sonnet/i, name: 'Claude 3.5 Sonnet', limit: 200000, softLimit: 200000, platform: 'claude' },
      { pattern: /claude.*3/i, name: 'Claude 3', limit: 200000, softLimit: 200000, platform: 'claude' },
      { pattern: /claude/i, name: 'Claude 3.5 / 3.7', limit: 200000, softLimit: 200000, platform: 'claude' },

      // DeepSeek Models (64k - 128k tokens)
      { pattern: /deepseek-r1|r1/i, name: 'DeepSeek-R1', limit: 128000, softLimit: 128000, platform: 'deepseek' },
      { pattern: /deepseek-v3|v3/i, name: 'DeepSeek-V3', limit: 64000, softLimit: 64000, platform: 'deepseek' },
      { pattern: /deepseek/i, name: 'DeepSeek-V3 / R1', limit: 64000, softLimit: 64000, platform: 'deepseek' },

      // Kimi Models (128k - 2M tokens)
      { pattern: /k1\.5|kimi.*k1/i, name: 'Kimi K1.5', limit: 2000000, softLimit: 2000000, platform: 'kimi' },
      { pattern: /kimi/i, name: 'Kimi Moonshot', limit: 128000, softLimit: 128000, platform: 'kimi' },

      // Qwen Models (128k tokens)
      { pattern: /qwen.*2\.5/i, name: 'Qwen 2.5', limit: 128000, softLimit: 128000, platform: 'qwen' },
      { pattern: /qwen/i, name: 'Qwen Max / 2.5', limit: 128000, softLimit: 128000, platform: 'qwen' }
    ];

    static getModelInfo(platformKey, scrapedModelText = '') {
      if (scrapedModelText) {
        const match = this.MODELS.find(m => m.pattern.test(scrapedModelText));
        if (match) return match;
      }
      const fallback = this.MODELS.find(m => m.platform === platformKey);
      if (fallback) return fallback;
      return { name: 'Generic Model', limit: 128000, softLimit: 128000, platform: 'generic' };
    }

    static formatTokenCount(tokens) {
      if (!tokens || isNaN(tokens)) return '0';
      if (tokens >= 1000000) {
        const num = tokens / 1000000;
        return `${num % 1 === 0 ? num : num.toFixed(1)}M`;
      }
      if (tokens >= 1000) {
        const num = tokens / 1000;
        return `${num % 1 === 0 ? num : num.toFixed(1)}k`;
      }
      return tokens.toLocaleString();
    }
  }

  // 2. TOKEN ENGINE
  class TokenEngine {
    static countTokens(text) {
      if (!text || typeof text !== 'string') {
        return { rawTokens: 0, wordCount: 0, charCount: 0 };
      }
      const charCount = text.length;
      if (charCount === 0) return { rawTokens: 0, wordCount: 0, charCount: 0 };

      const words = text.trim().split(/\s+/).filter(Boolean);
      const wordCount = words.length;

      let tokenCount = 0;
      const regex = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]|[a-zA-Z0-9]+|[^a-zA-Z0-9\s]|\s+/g;
      let match;

      while ((match = regex.exec(text)) !== null) {
        const chunk = match[0];
        if (/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(chunk)) {
          tokenCount += 1.3;
        } else if (/^\s+$/.test(chunk)) {
          if (chunk.includes('\n')) {
            tokenCount += chunk.split('\n').length - 1;
            const spaces = chunk.replace(/\n/g, '');
            tokenCount += Math.ceil(spaces.length / 4);
          } else {
            tokenCount += Math.ceil(chunk.length / 4);
          }
        } else if (/^[^a-zA-Z0-9\s]+$/.test(chunk)) {
          tokenCount += Math.max(1, Math.ceil(chunk.length / 2));
        } else {
          const subParts = chunk.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|_/);
          for (const part of subParts) {
            if (!part) continue;
            if (part.length <= 4) tokenCount += 1;
            else if (part.length <= 8) tokenCount += 1.5;
            else tokenCount += Math.ceil(part.length / 3.5);
          }
        }
      }

      return {
        rawTokens: Math.ceil(tokenCount),
        wordCount,
        charCount
      };
    }

    static applyMultiplier(rawTokens, multiplier = 1.0) {
      return Math.ceil(rawTokens * multiplier);
    }

    static analyzeTextTokens(fullText, codeText = '', multiplier = 1.0) {
      const fullAnalysis = this.countTokens(fullText);
      const codeAnalysis = this.countTokens(codeText);

      return {
        totalTokens: this.applyMultiplier(fullAnalysis.rawTokens, multiplier),
        codeTokens: this.applyMultiplier(codeAnalysis.rawTokens, multiplier),
        wordCount: fullAnalysis.wordCount,
        charCount: fullAnalysis.charCount
      };
    }
  }

  // 3. METRICS CALCULATOR
  class MetricsCalculator {
    static calculateMetrics(messages = [], platformConfig = {}) {
      const softLimit = platformConfig.softLimitTokens || 128000;
      const multiplier = platformConfig.tokenMultiplier || 1.0;

      let userTokens = 0;
      let assistantTokens = 0;
      let totalCodeTokens = 0;
      let totalWords = 0;
      let totalChars = 0;
      let userTurns = 0;
      let assistantTurns = 0;

      for (const msg of messages) {
        const text = msg.text || '';
        const codeText = msg.codeText || '';

        const analysis = TokenEngine.analyzeTextTokens(text, codeText, multiplier);

        totalWords += analysis.wordCount;
        totalChars += analysis.charCount;
        totalCodeTokens += analysis.codeTokens;

        if (msg.role === 'user') {
          userTokens += analysis.totalTokens;
          userTurns++;
        } else {
          assistantTokens += analysis.totalTokens;
          assistantTurns++;
        }
      }

      const totalTokens = userTokens + assistantTokens;
      const turnCount = Math.max(userTurns, assistantTurns);

      const userRatio = totalTokens > 0 ? Math.round((userTokens / totalTokens) * 100) : 50;
      const assistantRatio = totalTokens > 0 ? Math.round((assistantTokens / totalTokens) * 100) : 50;
      const codeDensity = totalTokens > 0 ? Math.min(100, Math.round((totalCodeTokens / totalTokens) * 100)) : 0;
      const capacityUsed = Math.min(100, (totalTokens / softLimit) * 100);

      const C_capacity = capacityUsed;
      const T_turn = Math.min(100, (turnCount / 30) * 100);
      const D_code = codeDensity;

      const rawBloatScore = 0.60 * C_capacity + 0.20 * T_turn + 0.20 * D_code;
      const bloatScore = Math.min(100, Math.round(rawBloatScore));

      let statusLevel = 'optimal';
      if (bloatScore >= 75) statusLevel = 'bloated';
      else if (bloatScore >= 50) statusLevel = 'dense';

      return {
        totalTokens,
        userTokens,
        assistantTokens,
        totalWords,
        totalChars,
        turnCount,
        userRatio,
        assistantRatio,
        codeDensity,
        capacityUsed: Math.round(capacityUsed),
        bloatScore,
        statusLevel,
        softLimit,
        remainingTokens: Math.max(0, softLimit - totalTokens)
      };
    }
  }

  // 4. MIGRATION PROMPT ENGINE
  const MIGRATION_PROMPT_TEXT =
    "We are reaching memory context limits in this session. Please generate a structured Markdown summary of our discussion, including: key requirements, established architectural decisions, ongoing tasks, and critical code snippets so I can paste it into a fresh session.";

  class MigrationPromptEngine {
    static getPromptText() {
      return MIGRATION_PROMPT_TEXT;
    }

    static injectPromptIntoInput(inputElement) {
      if (!inputElement) inputElement = this.findChatInput();
      if (!inputElement) return false;

      try {
        if (inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT') {
          inputElement.value = MIGRATION_PROMPT_TEXT;
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
          inputElement.dispatchEvent(new Event('change', { bubbles: true }));
          inputElement.focus();
        } else if (inputElement.isContentEditable || inputElement.getAttribute('contenteditable') === 'true') {
          inputElement.focus();
          inputElement.innerText = MIGRATION_PROMPT_TEXT;
          inputElement.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: MIGRATION_PROMPT_TEXT }));
        }
        return true;
      } catch (err) {
        return false;
      }
    }

    static findChatInput() {
      const selectors = [
        '#prompt-textarea',
        'div[contenteditable="true"][data-placeholder]',
        '.ProseMirror[contenteditable="true"]',
        'textarea[aria-label]',
        'div[contenteditable="true"]',
        'textarea'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && (el.offsetWidth || el.offsetHeight)) return el;
      }
      return null;
    }
  }

  // 5. PLATFORM ADAPTER CLASSES
  class BaseAdapter {
    constructor(config = {}) {
      this.platformKey = config.platformKey || 'generic';
      this.softLimitTokens = config.softLimitTokens || 128000;
      this.hardLimitTokens = config.hardLimitTokens || 1000000;
      this.tokenMultiplier = config.tokenMultiplier || 1.0;
    }
    matches() { return false; }
    getChatContainer() { return document.querySelector('main') || document.body; }
    extractModelName() { return ''; }
    getModelInfo() {
      const scrapedText = this.extractModelName();
      return ModelRegistry.getModelInfo(this.platformKey, scrapedText);
    }
    extractMessages() { return []; }
    cleanElementText(element) {
      if (!element) return '';
      const clone = element.cloneNode(true);
      const selectors = ['button', 'svg', '.copy-button', '.action-buttons', '.sr-only', 'style', 'script'];
      selectors.forEach(sel => clone.querySelectorAll(sel).forEach(el => el.remove()));
      return clone.textContent ? clone.textContent.trim() : '';
    }
    extractCodeText(element) {
      if (!element) return '';
      let codeContent = '';
      element.querySelectorAll('pre, code').forEach(block => {
        codeContent += ' ' + block.textContent;
      });
      return codeContent.trim();
    }
    getChatInput() { return document.querySelector('textarea, div[contenteditable="true"]'); }
  }

  class ChatGPTAdapter extends BaseAdapter {
    constructor() {
      super({ platformKey: 'chatgpt', softLimitTokens: 128000, hardLimitTokens: 128000, tokenMultiplier: 1.00 });
    }
    matches(hostname) { return /chatgpt\.com|chat\.openai\.com/.test(hostname); }
    extractModelName() {
      const selectors = ['[data-testid="model-switcher-dropdown-button"]', 'button[id^="radix-"]', '[aria-haspopup="menu"]', 'div[class*="model-name"]'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent) {
          const text = el.textContent.trim();
          if (/gpt|o1|o3/i.test(text)) return text;
        }
      }
      return 'GPT-4o';
    }
    extractMessages() {
      const messages = [];
      const elements = document.querySelectorAll('[data-message-author-role], article');
      elements.forEach((el, index) => {
        let role = el.getAttribute('data-message-author-role');
        if (!role) {
          if (el.querySelector('[data-message-author-role="user"]')) role = 'user';
          else role = 'assistant';
        }
        const text = this.cleanElementText(el);
        const codeText = this.extractCodeText(el);
        if (text) {
          messages.push({ id: el.id || `cg-msg-${index}`, role: role === 'user' ? 'user' : 'assistant', text, codeText, timestamp: Date.now() });
        }
      });
      return messages;
    }
    getChatInput() { return document.querySelector('#prompt-textarea') || document.querySelector('textarea'); }
  }

  class ClaudeAdapter extends BaseAdapter {
    constructor() {
      super({ platformKey: 'claude', softLimitTokens: 200000, hardLimitTokens: 200000, tokenMultiplier: 1.18 });
    }
    matches(hostname) { return /claude\.ai/.test(hostname); }
    extractModelName() {
      const selectors = ['button[data-testid="model-selector"]', 'div[class*="ModelSelector"]', 'button[aria-haspopup="menu"]'];
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
      const elements = document.querySelectorAll('.font-claude-message, .user-message-block, [data-is-streaming], div[class*="ChatMessage"]');
      elements.forEach((el, index) => {
        let role = 'assistant';
        if (el.classList.contains('user-message-block') || el.querySelector('.user-message-block')) role = 'user';
        const text = this.cleanElementText(el);
        const codeText = this.extractCodeText(el);
        if (text) {
          messages.push({ id: el.id || `claude-msg-${index}`, role, text, codeText, timestamp: Date.now() });
        }
      });
      return messages;
    }
    getChatInput() { return document.querySelector('fieldset div[contenteditable="true"]') || document.querySelector('div[contenteditable="true"]'); }
  }

  class GeminiAdapter extends BaseAdapter {
    constructor() {
      super({ platformKey: 'gemini', softLimitTokens: 1000000, hardLimitTokens: 2000000, tokenMultiplier: 1.05 });
    }
    matches(hostname) { return /gemini\.google\.com/.test(hostname); }
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
          if (/flash|pro|gemini|thinking|1\.5|2\.0/i.test(text)) return text;
        }
      }
      return 'Gemini 1.5 Flash';
    }
    extractMessages() {
      const messages = [];
      document.querySelectorAll('message-content, .user-query, .query-content, .model-response-text').forEach((el, index) => {
        let role = 'assistant';
        if (el.classList.contains('user-query') || el.classList.contains('query-content') || el.closest('.user-query-container')) role = 'user';
        const text = this.cleanElementText(el);
        const codeText = this.extractCodeText(el);
        if (text) messages.push({ id: el.id || `gemini-msg-${index}`, role, text, codeText, timestamp: Date.now() });
      });
      return messages;
    }
    getChatInput() { return document.querySelector('.input-area textarea') || document.querySelector('textarea[aria-label]'); }
  }

  class DeepSeekAdapter extends BaseAdapter {
    constructor() { super({ platformKey: 'deepseek', softLimitTokens: 64000, hardLimitTokens: 128000, tokenMultiplier: 1.10 }); }
    matches(hostname) { return /deepseek\.com/.test(hostname); }
    extractModelName() {
      const selectors = ['div[class*="model"]', '.model-select', 'header span'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent) {
          const text = el.textContent.trim();
          if (/deepseek|r1|v3/i.test(text)) return text;
        }
      }
      return 'DeepSeek-V3';
    }
    extractMessages() {
      const messages = [];
      document.querySelectorAll('._user-message, .ds-markdown, div[class*="chat-message"]').forEach((el, index) => {
        let role = 'assistant';
        if (el.classList.contains('._user-message') || el.closest('._user-message')) role = 'user';
        const text = this.cleanElementText(el);
        const codeText = this.extractCodeText(el);
        if (text) messages.push({ id: el.id || `ds-msg-${index}`, role, text, codeText, timestamp: Date.now() });
      });
      return messages;
    }
    getChatInput() { return document.querySelector('#chat-input') || document.querySelector('textarea'); }
  }

  class KimiAdapter extends BaseAdapter {
    constructor() { super({ platformKey: 'kimi', softLimitTokens: 128000, hardLimitTokens: 2000000, tokenMultiplier: 1.10 }); }
    matches(hostname) { return /moonshot\.cn|kimi\.ai/.test(hostname); }
    extractModelName() {
      const el = document.querySelector('.model-select, .k15-tag');
      return el && el.textContent ? el.textContent.trim() : 'Kimi Moonshot';
    }
    extractMessages() {
      const messages = [];
      document.querySelectorAll('.segment-content, .chat-segment, .chat-message').forEach((el, index) => {
        let role = el.classList.contains('user') ? 'user' : 'assistant';
        const text = this.cleanElementText(el);
        const codeText = this.extractCodeText(el);
        if (text) messages.push({ id: `kimi-${index}`, role, text, codeText, timestamp: Date.now() });
      });
      return messages;
    }
  }

  class QwenAdapter extends BaseAdapter {
    constructor() { super({ platformKey: 'qwen', softLimitTokens: 128000, hardLimitTokens: 128000, tokenMultiplier: 1.10 }); }
    matches(hostname) { return /aliyun\.com|qwenlm\.ai/.test(hostname); }
    extractModelName() {
      const el = document.querySelector('.model-tag, .qwen-model');
      return el && el.textContent ? el.textContent.trim() : 'Qwen 2.5';
    }
    extractMessages() {
      const messages = [];
      document.querySelectorAll('.chat-item, .message-item').forEach((el, index) => {
        let role = el.classList.contains('user') ? 'user' : 'assistant';
        const text = this.cleanElementText(el);
        const codeText = this.extractCodeText(el);
        if (text) messages.push({ id: `qwen-${index}`, role, text, codeText, timestamp: Date.now() });
      });
      return messages;
    }
  }

  class GenericAdapter extends BaseAdapter {
    constructor() { super({ platformKey: 'generic', softLimitTokens: 128000, hardLimitTokens: 128000, tokenMultiplier: 1.00 }); }
    matches() { return true; }
    extractMessages() {
      const messages = [];
      const selectors = ['article', '[role="data-message"]', '.message', '.chat-message', '.msg', '.conversation-turn'];
      let elements = [];
      for (const sel of selectors) {
        const found = document.querySelectorAll(sel);
        if (found.length > 0) { elements = Array.from(found); break; }
      }
      if (elements.length === 0) {
        const main = this.getChatContainer();
        if (main) elements = Array.from(main.querySelectorAll('div > p, section > div')).filter(el => el.textContent.length > 20);
      }
      elements.forEach((el, index) => {
        let role = el.className.toLowerCase().includes('user') ? 'user' : 'assistant';
        const text = this.cleanElementText(el);
        const codeText = this.extractCodeText(el);
        if (text) messages.push({ id: `gen-msg-${index}`, role, text, codeText, timestamp: Date.now() });
      });
      return messages;
    }
  }

  // 6. SHADOW DOM HUD UI
  class ShadowContainer {
    constructor(onPrepareSummary = null) {
      this.host = null;
      this.shadowRoot = null;
      this.isExpanded = false;
      this.wasDragging = false;
      this.onPrepareSummary = onPrepareSummary;
      this.init();
    }

    init() {
      if (document.getElementById('omni-context-root')) return;
      this.host = document.createElement('div');
      this.host.id = 'omni-context-root';
      document.body.appendChild(this.host);

      this.shadowRoot = this.host.attachShadow({ mode: 'open' });
      this.renderSkeleton();
      this.setupDragging();
    }

    setVisible(visible) {
      if (this.host) {
        this.host.style.setProperty('display', visible ? 'block' : 'none', 'important');
      }
    }

    renderSkeleton() {
      this.shadowRoot.innerHTML = `
        <style>
          :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; box-sizing: border-box; }
          *, *:before, *:after { box-sizing: border-box; }
          .omni-hud-root { position: fixed; top: 20px; right: 20px; z-index: 2147483647; user-select: none; font-size: 13px; color: #f8fafc; direction: ltr; }
          .omni-badge { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(15, 23, 42, 0.94); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 30px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(56, 189, 248, 0.2); cursor: grab; transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease; }
          .omni-badge:hover { border-color: rgba(56, 189, 248, 0.6); box-shadow: 0 12px 30px -5px rgba(0, 0, 0, 0.7), 0 0 22px rgba(56, 189, 248, 0.4); }
          .omni-badge:active { cursor: grabbing; }
          .omni-drag-handle { color: #64748b; font-size: 14px; font-weight: 900; letter-spacing: -2px; cursor: grab; padding: 0 2px; user-select: none; }
          .omni-drag-handle:hover { color: #38bdf8; }
          .omni-close-btn { background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.1); color: #94a3b8; font-size: 13px; font-weight: 700; cursor: pointer; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; line-height: 1; margin-left: 4px; transition: all 0.15s ease; flex-shrink: 0; }
          .omni-close-btn:hover { background: #ef4444; color: #ffffff; border-color: #ef4444; }
          .omni-status-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
          .omni-status-optimal { background: #4ade80; box-shadow: 0 0 8px #4ade80; }
          .omni-status-dense { background: #facc15; box-shadow: 0 0 8px #facc15; }
          .omni-status-bloated { background: #f87171; box-shadow: 0 0 10px #f87171; animation: pulse 1.2s infinite; }
          @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.2); } 100% { transform: scale(1); } }
          .omni-divider { width: 1px; height: 14px; background: rgba(255, 255, 255, 0.2); }
          .omni-card { margin-top: 10px; width: 320px; min-width: 260px; min-height: 220px; max-width: 600px; max-height: 850px; resize: both; overflow: auto; background: rgba(15, 23, 42, 0.96); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 16px; padding: 16px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7); display: flex; flex-direction: column; gap: 12px; animation: omni-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
          @keyframes omni-fade-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
          .omni-card-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 8px; cursor: grab; }
          .omni-card-header:active { cursor: grabbing; }
          .omni-card-title { font-size: 13px; font-weight: 700; background: linear-gradient(135deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
          .omni-card-platform { font-size: 10px; padding: 2px 8px; border-radius: 10px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-weight: 600; text-transform: uppercase; }
          .omni-metric-row { display: flex; flex-direction: column; gap: 4px; }
          .omni-metric-label { display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; }
          .omni-progress-bg { width: 100%; height: 6px; background: rgba(255, 255, 255, 0.08); border-radius: 4px; overflow: hidden; }
          .omni-progress-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease, background 0.3s ease; }
          .omni-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
          .omni-stat-box { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 2px; }
          .omni-stat-val { font-size: 14px; font-weight: 700; color: #f1f5f9; }
          .omni-stat-lbl { font-size: 10px; color: #64748b; }
          .omni-btn { background: linear-gradient(135deg, #0284c7, #4f46e5); color: #ffffff; border: none; border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: filter 0.15s ease; }
          .omni-btn:hover { filter: brightness(1.15); }
          .omni-btn-danger { background: linear-gradient(135deg, #dc2626, #991b1b); }
        </style>
        <div class="omni-hud-root" id="omni-hud">
          <div class="omni-badge" id="omni-badge-btn" title="Drag handle to move | Click to expand dashboard">
            <span class="omni-drag-handle" title="Drag to move">⋮⋮</span>
            <span class="omni-status-dot omni-status-optimal" id="omni-dot"></span>
            <span style="font-weight: 700; color: #38bdf8;">OmniContext</span>
            <span class="omni-divider"></span>
            <span class="omni-badge-text" id="omni-badge-summary">0 Tokens | 0% Bloat</span>
            <button class="omni-close-btn" id="omni-badge-close" title="Close / Hide Overlay">✕</button>
          </div>

          <div class="omni-card" id="omni-card-body" style="display: none;">
            <div class="omni-card-header" id="omni-card-header" title="Drag header to move">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="omni-card-title" id="omni-model-title">Model</span>
                <span class="omni-card-platform" id="omni-platform-badge">Generic</span>
              </div>
              <div style="display: flex; align-items: center; gap: 4px;">
                <button class="omni-close-btn" id="omni-card-minimize" title="Minimize Dashboard" style="font-size: 14px;">−</button>
                <button class="omni-close-btn" id="omni-card-close" title="Close / Hide Overlay">✕</button>
              </div>
            </div>
            <div class="omni-metric-row">
              <div class="omni-metric-label">
                <span>Capacity Used</span>
                <span id="omni-cap-text">0 / 128k (0%)</span>
              </div>
              <div class="omni-progress-bg">
                <div class="omni-progress-fill" id="omni-cap-bar" style="width: 0%; background: #38bdf8;"></div>
              </div>
            </div>
            <div class="omni-metric-row">
              <div class="omni-metric-label">
                <span>Context Bloat Score</span>
                <span id="omni-bloat-text">0 / 100</span>
              </div>
              <div class="omni-progress-bg">
                <div class="omni-progress-fill" id="omni-bloat-bar" style="width: 0%; background: #4ade80;"></div>
              </div>
            </div>
            <div class="omni-stats-grid">
              <div class="omni-stat-box"><span class="omni-stat-val" id="omni-stat-turns">0</span><span class="omni-stat-lbl">Turns / Messages</span></div>
              <div class="omni-stat-box"><span class="omni-stat-val" id="omni-stat-code">0%</span><span class="omni-stat-lbl">Code Density</span></div>
              <div class="omni-stat-box"><span class="omni-stat-val" id="omni-stat-ratio">50/50</span><span class="omni-stat-lbl">User / Assist Ratio</span></div>
              <div class="omni-stat-box"><span class="omni-stat-val" id="omni-stat-status">Optimal</span><span class="omni-stat-lbl">Health Level</span></div>
            </div>
            <button class="omni-btn" id="omni-migrate-btn">Prepare Context Summary</button>
          </div>
        </div>
      `;

      const badgeBtn = this.shadowRoot.getElementById('omni-badge-btn');
      badgeBtn.addEventListener('click', (e) => {
        if (e.target.closest('.omni-close-btn')) return;
        if (this.wasDragging) { this.wasDragging = false; return; }
        const card = this.shadowRoot.getElementById('omni-card-body');
        this.isExpanded = card.style.display === 'none';
        card.style.display = this.isExpanded ? 'flex' : 'none';
      });

      const cardMinimize = this.shadowRoot.getElementById('omni-card-minimize');
      if (cardMinimize) {
        cardMinimize.addEventListener('click', (e) => {
          e.stopPropagation();
          const card = this.shadowRoot.getElementById('omni-card-body');
          this.isExpanded = false;
          card.style.display = 'none';
        });
      }

      const badgeClose = this.shadowRoot.getElementById('omni-badge-close');
      const cardClose = this.shadowRoot.getElementById('omni-card-close');
      
      const closeHandler = (e) => {
        e.stopPropagation();
        this.setVisible(false);
      };

      if (badgeClose) badgeClose.addEventListener('click', closeHandler);
      if (cardClose) cardClose.addEventListener('click', closeHandler);

      const migrateBtn = this.shadowRoot.getElementById('omni-migrate-btn');
      migrateBtn.addEventListener('click', () => {
        if (this.onPrepareSummary) this.onPrepareSummary();
        else MigrationPromptEngine.injectPromptIntoInput();
      });
    }

    updateMetrics(metrics, platformKey = 'generic', modelName = '') {
      if (!metrics) return;
      const formattedLimit = ModelRegistry.formatTokenCount(metrics.softLimit);
      const formattedTotal = ModelRegistry.formatTokenCount(metrics.totalTokens);

      this.shadowRoot.getElementById('omni-badge-summary').innerText = `${formattedTotal} T | ${metrics.bloatScore}% Bloat`;
      this.shadowRoot.getElementById('omni-dot').className = `omni-status-dot omni-status-${metrics.statusLevel}`;
      this.shadowRoot.getElementById('omni-platform-badge').innerText = platformKey;
      if (modelName) {
        this.shadowRoot.getElementById('omni-model-title').innerText = modelName;
      }
      this.shadowRoot.getElementById('omni-cap-text').innerText = `${metrics.totalTokens.toLocaleString()} / ${formattedLimit} (${metrics.capacityUsed}%)`;

      const capBar = this.shadowRoot.getElementById('omni-cap-bar');
      capBar.style.width = `${metrics.capacityUsed}%`;
      capBar.style.background = metrics.capacityUsed > 80 ? '#f87171' : metrics.capacityUsed > 50 ? '#facc15' : '#38bdf8';

      this.shadowRoot.getElementById('omni-bloat-text').innerText = `${metrics.bloatScore} / 100 (${metrics.statusLevel.toUpperCase()})`;

      const bloatBar = this.shadowRoot.getElementById('omni-bloat-bar');
      bloatBar.style.width = `${metrics.bloatScore}%`;
      bloatBar.style.background = metrics.bloatScore >= 75 ? '#f87171' : metrics.bloatScore >= 50 ? '#facc15' : '#4ade80';

      this.shadowRoot.getElementById('omni-stat-turns').innerText = `${metrics.turnCount}`;
      this.shadowRoot.getElementById('omni-stat-code').innerText = `${metrics.codeDensity}%`;
      this.shadowRoot.getElementById('omni-stat-ratio').innerText = `${metrics.userRatio}/${metrics.assistantRatio}`;

      const statStatus = this.shadowRoot.getElementById('omni-stat-status');
      statStatus.innerText = metrics.statusLevel.toUpperCase();
      statStatus.style.color = metrics.statusLevel === 'bloated' ? '#f87171' : metrics.statusLevel === 'dense' ? '#facc15' : '#4ade80';

      const migrateBtn = this.shadowRoot.getElementById('omni-migrate-btn');
      if (metrics.bloatScore >= 75) {
        migrateBtn.className = 'omni-btn omni-btn-danger';
        migrateBtn.innerText = 'Context Bloated: Prepare Summary';
      } else {
        migrateBtn.className = 'omni-btn';
        migrateBtn.innerText = 'Prepare Context Summary';
      }
    }

    setupDragging() {
      const root = this.shadowRoot.getElementById('omni-hud');
      const badge = this.shadowRoot.getElementById('omni-badge-btn');
      const cardHeader = this.shadowRoot.getElementById('omni-card-header');
      if (!root) return;

      let isMouseDown = false, startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

      const onMouseDown = (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.omni-close-btn')) return;
        isMouseDown = true; this.wasDragging = false;
        startX = e.clientX; startY = e.clientY;
        const rect = root.getBoundingClientRect();
        initialLeft = rect.left; initialTop = rect.top;
        root.style.right = 'auto'; root.style.left = `${initialLeft}px`; root.style.top = `${initialTop}px`;
        e.preventDefault();
      };

      if (badge) badge.addEventListener('mousedown', onMouseDown);
      if (cardHeader) cardHeader.addEventListener('mousedown', onMouseDown);

      window.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.wasDragging = true;
        const newLeft = Math.max(10, Math.min(window.innerWidth - 100, initialLeft + dx));
        const newTop = Math.max(10, Math.min(window.innerHeight - 50, initialTop + dy));
        root.style.left = `${newLeft}px`; root.style.top = `${newTop}px`;
      });

      window.addEventListener('mouseup', () => { isMouseDown = false; });
    }
  }

  // 7. MAIN CONTENT ORCHESTRATOR
  class ContentOrchestrator {
    constructor() {
      this.adapter = null;
      this.shadowUI = null;
      this.debounceTimer = null;
      this.latestMetrics = null;
      this.modelInfo = null;
      this.isEnabled = true;
      this.init();
    }

    async init() {
      this.selectAdapter();
      this.shadowUI = new ShadowContainer(() => this.handlePrepareSummary());
      this.setupMessageListeners();
      this.setupStorageListeners();
      await this.checkEnabledState();
      if (this.isEnabled) {
        this.performScan();
        this.setupMutationObserver();
      }
    }

    async checkEnabledState() {
      return new Promise((resolve) => {
        if (extApi && extApi.storage && extApi.storage.local) {
          const getter = extApi.storage.local.get('extensionEnabled');
          if (getter && typeof getter.then === 'function') {
            getter.then((res) => {
              this.isEnabled = res && res.extensionEnabled !== undefined ? res.extensionEnabled : true;
              this.shadowUI.setVisible(this.isEnabled);
              resolve();
            }).catch(() => {
              this.shadowUI.setVisible(true);
              resolve();
            });
          } else {
            extApi.storage.local.get(['extensionEnabled'], (res) => {
              this.isEnabled = res && res.extensionEnabled !== undefined ? res.extensionEnabled : true;
              this.shadowUI.setVisible(this.isEnabled);
              resolve();
            });
          }
        } else {
          this.shadowUI.setVisible(true);
          resolve();
        }
      });
    }

    selectAdapter() {
      const hostname = window.location.hostname;
      const adapters = [new ChatGPTAdapter(), new ClaudeAdapter(), new GeminiAdapter(), new DeepSeekAdapter(), new KimiAdapter(), new QwenAdapter()];
      for (const ad of adapters) {
        if (ad.matches(hostname)) { this.adapter = ad; break; }
      }
      if (!this.adapter) this.adapter = new GenericAdapter();
    }

    setupMutationObserver() {
      const target = this.adapter.getChatContainer() || document.body;
      const observer = new MutationObserver(() => {
        if (!this.isEnabled) return;
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.performScan(), 500);
      });
      observer.observe(target, { childList: true, subtree: true, characterData: true });
    }

    performScan() {
      if (!this.isEnabled) return;

      try {
        const messages = this.adapter.extractMessages();
        this.modelInfo = this.adapter.getModelInfo();

        const metrics = MetricsCalculator.calculateMetrics(messages, {
          softLimitTokens: this.modelInfo.softLimit,
          hardLimitTokens: this.modelInfo.limit,
          tokenMultiplier: this.adapter.tokenMultiplier
        });

        metrics.modelName = this.modelInfo.name;
        this.latestMetrics = metrics;

        this.shadowUI.updateMetrics(metrics, this.adapter.platformKey, this.modelInfo.name);
        this.syncStateToBackground(metrics);
      } catch (err) {}
    }

    syncStateToBackground(metrics) {
      const payload = {
        type: 'OMNI_METRICS_UPDATE',
        platformKey: this.adapter.platformKey,
        modelName: this.modelInfo ? this.modelInfo.name : 'Default Model',
        url: window.location.href,
        metrics,
        timestamp: Date.now()
      };

      if (extApi && extApi.runtime && extApi.runtime.sendMessage) {
        try {
          extApi.runtime.sendMessage(payload, () => { if (extApi.runtime.lastError) {} });
        } catch (e) {}
      }
      if (extApi && extApi.storage && extApi.storage.local) {
        extApi.storage.local.set({ activeMetrics: payload });
      }
    }

    handlePrepareSummary() {
      if (!this.isEnabled) return;
      const input = this.adapter.getChatInput() || MigrationPromptEngine.findChatInput();
      const success = MigrationPromptEngine.injectPromptIntoInput(input);
      if (navigator.clipboard) navigator.clipboard.writeText(MigrationPromptEngine.getPromptText()).catch(() => {});
      this.showToast(success ? 'Summary prompt injected into input.' : 'Prompt copied to clipboard.');
    }

    showToast(message) {
      const toast = document.createElement('div');
      toast.innerText = message;
      Object.assign(toast.style, {
        position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
        backgroundColor: '#0f172a', color: '#38bdf8', padding: '10px 20px', borderRadius: '20px',
        border: '1px solid #38bdf8', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', zIndex: '2147483647',
        fontSize: '13px', fontWeight: '600'
      });
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }

    setupStorageListeners() {
      if (extApi && extApi.storage && extApi.storage.onChanged) {
        extApi.storage.onChanged.addListener((changes, namespace) => {
          if (namespace === 'local' && changes.extensionEnabled !== undefined) {
            this.isEnabled = !!changes.extensionEnabled.newValue;
            this.shadowUI.setVisible(this.isEnabled);
            if (this.isEnabled) {
              this.performScan();
            }
          }
        });
      }
    }

    setupMessageListeners() {
      if (extApi && extApi.runtime && extApi.runtime.onMessage) {
        extApi.runtime.onMessage.addListener((request, sender, sendResponse) => {
          if (request.action === 'SET_EXTENSION_STATE') {
            this.isEnabled = !!request.enabled;
            this.shadowUI.setVisible(this.isEnabled);
            if (this.isEnabled) {
              this.performScan();
            }
            sendResponse({ status: 'ok', enabled: this.isEnabled });
          } else if (request.action === 'GET_METRICS') {
            if (this.isEnabled) this.performScan();
            sendResponse({ metrics: this.latestMetrics, platformKey: this.adapter.platformKey, modelName: this.modelInfo ? this.modelInfo.name : 'Default Model', isEnabled: this.isEnabled });
          } else if (request.action === 'PREPARE_SUMMARY') {
            if (this.isEnabled) this.handlePrepareSummary();
            sendResponse({ status: 'ok' });
          } else if (request.action === 'FORCE_RESCAN') {
            if (this.isEnabled) this.performScan();
            sendResponse({ metrics: this.latestMetrics });
          }
          return true;
        });
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new ContentOrchestrator());
  } else {
    new ContentOrchestrator();
  }
})();
