/**
 * OmniContext Model Registry & Context Limit Database
 * Maps dynamic model names, API model IDs, and platforms to accurate context
 * window limits (e.g. Gemini 1M/2M, GPT-4.1 1M, Claude 200k).
 *
 * Per SPEC-1 §3.3: the `softLimit` field is removed — the advertised context
 * limit IS the hard limit, and effective degradation is modeled by the
 * Bloat/Rot formula in MetricsCalculator rather than an arbitrary soft cap.
 */

export class ModelRegistry {
  static MODELS = [
    // === Gemini ===
    { pattern: /gemini.*2\.5.*pro/i, name: 'Gemini 2.5 Pro', limit: 1000000, platform: 'gemini', multiplier: 1.05 },
    { pattern: /gemini.*2\.5.*flash/i, name: 'Gemini 2.5 Flash', limit: 1000000, platform: 'gemini', multiplier: 1.05 },
    { pattern: /gemini.*2\.0.*flash/i, name: 'Gemini 2.0 Flash', limit: 1000000, platform: 'gemini', multiplier: 1.05 },
    { pattern: /gemini.*1\.5.*pro/i, name: 'Gemini 1.5 Pro', limit: 2000000, platform: 'gemini', multiplier: 1.05 },
    { pattern: /gemini.*1\.5/i, name: 'Gemini 1.5 Flash', limit: 1000000, platform: 'gemini', multiplier: 1.05 },
    { pattern: /gemini/i, name: 'Gemini (default)', limit: 1000000, platform: 'gemini', multiplier: 1.05 },

    // === OpenAI / ChatGPT ===
    { pattern: /gpt-?4\.?1/i, name: 'GPT-4.1', limit: 1000000, platform: 'chatgpt', multiplier: 1.00 },
    { pattern: /gpt-?4o-?mini/i, name: 'GPT-4o mini', limit: 128000, platform: 'chatgpt', multiplier: 1.00 },
    { pattern: /gpt-?4o/i, name: 'GPT-4o', limit: 128000, platform: 'chatgpt', multiplier: 1.00 },
    { pattern: /o4-?mini/i, name: 'o4-mini', limit: 200000, platform: 'chatgpt', multiplier: 1.00 },
    { pattern: /o3-?mini/i, name: 'o3-mini', limit: 200000, platform: 'chatgpt', multiplier: 1.00 },
    { pattern: /o3/i, name: 'o3', limit: 200000, platform: 'chatgpt', multiplier: 1.00 },
    { pattern: /o1-?mini/i, name: 'o1-mini', limit: 128000, platform: 'chatgpt', multiplier: 1.00 },
    { pattern: /o1/i, name: 'o1', limit: 200000, platform: 'chatgpt', multiplier: 1.00 },
    { pattern: /gpt-?4/i, name: 'GPT-4', limit: 128000, platform: 'chatgpt', multiplier: 1.00 },
    { pattern: /chatgpt/i, name: 'ChatGPT (GPT-4o)', limit: 128000, platform: 'chatgpt', multiplier: 1.00 },

    // === Claude (Anthropic) ===
    { pattern: /claude.*opus.*4/i, name: 'Claude Opus 4', limit: 200000, platform: 'claude', multiplier: 1.15 },
    { pattern: /claude.*sonnet.*4/i, name: 'Claude Sonnet 4', limit: 200000, platform: 'claude', multiplier: 1.15 },
    { pattern: /claude.*4/i, name: 'Claude 4', limit: 200000, platform: 'claude', multiplier: 1.15 },
    { pattern: /claude.*3[.\- ]7/i, name: 'Claude 3.7 Sonnet', limit: 200000, platform: 'claude', multiplier: 1.15 },
    { pattern: /claude.*3[.\- ]5.*sonnet/i, name: 'Claude 3.5 Sonnet', limit: 200000, platform: 'claude', multiplier: 1.15 },
    { pattern: /claude.*3/i, name: 'Claude 3', limit: 200000, platform: 'claude', multiplier: 1.15 },
    { pattern: /claude/i, name: 'Claude (default)', limit: 200000, platform: 'claude', multiplier: 1.15 },

    // === DeepSeek ===
    { pattern: /deepseek.*r1/i, name: 'DeepSeek-R1', limit: 128000, platform: 'deepseek', multiplier: 1.10 },
    { pattern: /deepseek.*v3/i, name: 'DeepSeek-V3', limit: 128000, platform: 'deepseek', multiplier: 1.10 },
    { pattern: /deepseek/i, name: 'DeepSeek (default)', limit: 128000, platform: 'deepseek', multiplier: 1.10 },

    // === Kimi ===
    { pattern: /k1\.5|kimi.*k1/i, name: 'Kimi K1.5', limit: 2000000, platform: 'kimi', multiplier: 1.10 },
    { pattern: /kimi/i, name: 'Kimi Moonshot', limit: 128000, platform: 'kimi', multiplier: 1.10 },

    // === Qwen ===
    { pattern: /qwen.*3/i, name: 'Qwen 3', limit: 128000, platform: 'qwen', multiplier: 1.10 },
    { pattern: /qwen.*2\.5/i, name: 'Qwen 2.5', limit: 128000, platform: 'qwen', multiplier: 1.10 },
    { pattern: /qwen/i, name: 'Qwen (default)', limit: 128000, platform: 'qwen', multiplier: 1.10 }
  ];

  /**
   * Resolves model info based on platform key and DOM-extracted text.
   * @param {string} platformKey
   * @param {string} scrapedModelText
   * @returns {{ name: string, limit: number, platform: string, multiplier: number }}
   */
  static getModelInfo(platformKey, scrapedModelText = '') {
    if (scrapedModelText) {
      const match = this.MODELS.find((m) => m.pattern.test(scrapedModelText));
      if (match) return match;
    }

    // Default fallback by platform key
    const fallback = this.MODELS.find((m) => m.platform === platformKey);
    if (fallback) return fallback;

    return { name: 'Generic Model', limit: 128000, platform: 'generic', multiplier: 1.0 };
  }

  /**
   * Resolves model info from an API model ID captured by the network
   * interceptor (e.g. "gpt-4.1", "claude-sonnet-4-5", "gemini-2.5-pro").
   * API IDs often embed model family but not the exact advertised name;
   * this returns the best-matching registry entry, or null when the ID
   * cannot be attributed to any registered model.
   * @param {string} modelId
   * @returns {Object|null}
   */
  static getModelByApiId(modelId) {
    if (!modelId || typeof modelId !== 'string') return null;

    // Try progressively less-normalized forms so both "gpt-4.1" and
    // "claude-3-7-sonnet" match their registry patterns:
    //   1. raw (with separators)   "claude-3-7-sonnet"
    //   2. compacted              "gpt-4.1" -> "gpt4.1"
    //   3. hyphen -> dot          "claude-3-7-sonnet" -> "claude.3.7.sonnet"
    const candidates = [
      modelId.trim(),
      modelId.replace(/[-_]/g, ''),
      modelId.replace(/-/g, '.')
    ];

    for (const candidate of candidates) {
      const match = this.MODELS.find((m) => m.pattern.test(candidate));
      if (match) return match;
    }
    return null;
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
