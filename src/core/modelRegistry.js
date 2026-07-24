/**
 * OmniContext Model Registry & Context Limit Database
 * Maps dynamic model names and platforms to accurate context window limits (e.g. Gemini 1M/2M, GPT-4o 128k, Claude 200k).
 */

export class ModelRegistry {
  static MODELS = [
    // Gemini Models (1M - 2M tokens)
    { pattern: /gemini.*1\.5.*pro/i, name: 'Gemini 1.5 Pro', limit: 2000000, softLimit: 2000000, platform: 'gemini' },
    { pattern: /gemini.*2\.0/i, name: 'Gemini 2.0 Flash', limit: 1000000, softLimit: 1000000, platform: 'gemini' },
    { pattern: /gemini.*1\.5/i, name: 'Gemini 1.5 Flash', limit: 1000000, softLimit: 1000000, platform: 'gemini' },
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

  /**
   * Resolves model info and soft limit based on platform key and DOM-extracted text.
   * @param {string} platformKey 
   * @param {string} scrapedModelText 
   * @returns {{ name: string, limit: number, softLimit: number, platform: string }}
   */
  static getModelInfo(platformKey, scrapedModelText = '') {
    if (scrapedModelText) {
      const match = this.MODELS.find(m => m.pattern.test(scrapedModelText));
      if (match) return match;
    }

    // Default fallback by platform key
    const fallback = this.MODELS.find(m => m.platform === platformKey);
    if (fallback) return fallback;

    return { name: 'Generic Model', limit: 128000, softLimit: 128000, platform: 'generic' };
  }

  /**
   * Formats token counts nicely (e.g. 1000000 -> 1M, 128000 -> 128k, 64000 -> 64k)
   * @param {number} tokens 
   * @returns {string}
   */
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
