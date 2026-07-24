/**
 * OmniContext Tokenization Engine
 * Fast local subword BPE token estimation based on o200k_base encoding heuristics with provider multipliers.
 */

export class TokenEngine {
  /**
   * Estimates raw token count for a text string using o200k_base BPE subword heuristics.
   * @param {string} text 
   * @returns {{ rawTokens: number, wordCount: number, charCount: number, codeTokens: number }}
   */
  static countTokens(text) {
    if (!text || typeof text !== 'string') {
      return { rawTokens: 0, wordCount: 0, charCount: 0, codeTokens: 0 };
    }

    const charCount = text.length;
    if (charCount === 0) {
      return { rawTokens: 0, wordCount: 0, charCount: 0, codeTokens: 0 };
    }

    // Extract words count
    const words = text.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    let tokenCount = 0;
    
    // Process text by matching subword chunks, whitespace, punctuation, CJK, numbers, symbols
    // o200k_base pattern decomposition
    const regex = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]|[a-zA-Z0-9]+|[^a-zA-Z0-9\s]|\s+/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const chunk = match[0];
      
      // 1. CJK character: usually 1.2 to 2 tokens per char
      if (/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/.test(chunk)) {
        tokenCount += 1.3;
      }
      // 2. Whitespace: 1 token for newlines or sequence of spaces
      else if (/^\s+$/.test(chunk)) {
        if (chunk.includes('\n')) {
          tokenCount += chunk.split('\n').length - 1;
          const spaces = chunk.replace(/\n/g, '');
          tokenCount += Math.ceil(spaces.length / 4);
        } else {
          tokenCount += Math.ceil(chunk.length / 4);
        }
      }
      // 3. Punctuation / Special Symbols: usually 1 token per 1-2 symbols
      else if (/^[^a-zA-Z0-9\s]+$/.test(chunk)) {
        tokenCount += Math.max(1, Math.ceil(chunk.length / 2));
      }
      // 4. Alpha / Numeric words: BPE subword splitting based on length and camelCase/snake_case
      else {
        // Sub-split camelCase or snake_case
        const subParts = chunk.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|_/);
        for (const part of subParts) {
          if (!part) continue;
          if (part.length <= 4) {
            tokenCount += 1;
          } else if (part.length <= 8) {
            tokenCount += 1.5;
          } else {
            tokenCount += Math.ceil(part.length / 3.5);
          }
        }
      }
    }

    const rawTokens = Math.ceil(tokenCount);
    return {
      rawTokens,
      wordCount,
      charCount
    };
  }

  /**
   * Applies provider specific multiplier heuristics.
   * @param {number} rawTokens 
   * @param {number} multiplier 
   * @returns {number}
   */
  static applyMultiplier(rawTokens, multiplier = 1.0) {
    return Math.ceil(rawTokens * multiplier);
  }

  /**
   * Counts tokens specifically for code blocks versus prose.
   * @param {string} fullText 
   * @param {string} codeText 
   * @param {number} multiplier 
   * @returns {{ totalTokens: number, codeTokens: number }}
   */
  static analyzeTextTokens(fullText, codeText = '', multiplier = 1.0) {
    const fullAnalysis = this.countTokens(fullText);
    const codeAnalysis = this.countTokens(codeText);

    const totalTokens = this.applyMultiplier(fullAnalysis.rawTokens, multiplier);
    const codeTokens = this.applyMultiplier(codeAnalysis.rawTokens, multiplier);

    return {
      totalTokens,
      codeTokens,
      wordCount: fullAnalysis.wordCount,
      charCount: fullAnalysis.charCount
    };
  }
}
