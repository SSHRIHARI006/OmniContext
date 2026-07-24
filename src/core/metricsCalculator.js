/**
 * OmniContext Metrics & Bloat Calculator
 * Computes detailed metrics and composite Context Bloat Score according to SPEC Section 4.
 */

import { TokenEngine } from './tokenEngine.js';

export class MetricsCalculator {
  /**
   * Calculates complete MetricsPayload given messages and platform configuration.
   * @param {Array<{id: string, role: 'user'|'assistant'|'system', text: string, codeText?: string}>} messages 
   * @param {Object} platformConfig 
   * @returns {Object} MetricsPayload
   */
  static calculateMetrics(messages = [], platformConfig = {}) {
    const softLimit = platformConfig.softLimitTokens || 24000;
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
      } else if (msg.role === 'assistant') {
        assistantTokens += analysis.totalTokens;
        assistantTurns++;
      } else {
        // System or other roles count toward total assistant/system bucket
        assistantTokens += analysis.totalTokens;
      }
    }

    const totalTokens = userTokens + assistantTokens;
    const turnCount = Math.max(userTurns, assistantTurns);

    // Calculate User vs Assistant ratios
    const userRatio = totalTokens > 0 ? Math.round((userTokens / totalTokens) * 100) : 0;
    const assistantRatio = totalTokens > 0 ? Math.round((assistantTokens / totalTokens) * 100) : 0;

    // Code density percentage
    const codeDensity = totalTokens > 0 ? Math.min(100, Math.round((totalCodeTokens / totalTokens) * 100)) : 0;

    // Capacity used percentage against soft limit
    const capacityUsed = Math.min(100, (totalTokens / softLimit) * 100);

    // Component calculations for bloat score
    // C_capacity = min(100, (Total Tokens / Soft Limit) * 100)
    const C_capacity = capacityUsed;

    // T_turn = min(100, (Turn Count / 30) * 100)
    const T_turn = Math.min(100, (turnCount / 30) * 100);

    // D_code = min(100, (Code Tokens / Total Tokens) * 100)
    const D_code = codeDensity;

    // Bloat Score Formula: S_bloat = min(100, 0.60 * C_capacity + 0.20 * T_turn + 0.20 * D_code)
    const rawBloatScore = 0.60 * C_capacity + 0.20 * T_turn + 0.20 * D_code;
    const bloatScore = Math.min(100, Math.round(rawBloatScore));

    // Status Level Classification (FR-4.2)
    let statusLevel = 'optimal';
    if (bloatScore >= 75) {
      statusLevel = 'bloated';
    } else if (bloatScore >= 50) {
      statusLevel = 'dense';
    } else {
      statusLevel = 'optimal';
    }

    const remainingTokens = Math.max(0, softLimit - totalTokens);

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
      remainingTokens
    };
  }
}
