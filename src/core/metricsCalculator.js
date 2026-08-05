/**
 * OmniContext Metrics & Context Health Calculator
 * Computes detailed metrics plus the SPEC-1 five-signal Context Bloat /
 * Context Rot composite scores:
 *
 *   S_bloat = min(100, 0.35·Cp + 0.30·Ri + 0.15·Id + 0.10·Td + 0.10·Dr)
 *   S_rot   = min(100, 0.25·Cp + 0.20·Ri + 0.25·Id + 0.20·Td + 0.10·Dr)
 *   S_health = max(S_bloat, S_rot)
 *
 * Signals: Capacity Pressure (Cp), Redundancy Index (Ri), Information Gain
 * Decay (Id), Turn Depth Factor (Td), Code Repetition Density (Dr).
 */

class MetricsCalculator {
  static DEFAULT_TOKENS_PER_TURN = 800;

  /**
   * Calculates complete MetricsPayload given messages and platform configuration.
   * @param {Array<{id: string, role: 'user'|'assistant'|'system', text: string, codeText?: string}>} messages
   * @param {Object} platformConfig
   * @returns {Object} MetricsPayload
   */
  static calculateMetrics(messages = [], platformConfig = {}) {
    if (!Array.isArray(messages)) {
      throw new TypeError(`calculateMetrics expects an array of messages, received ${typeof messages}`);
    }
    const contextLimit = platformConfig.hardLimitTokens || platformConfig.contextLimit || 128000;
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

    // User vs Assistant ratios
    const userRatio = totalTokens > 0 ? Math.round((userTokens / totalTokens) * 100) : 0;
    const assistantRatio = totalTokens > 0 ? Math.round((assistantTokens / totalTokens) * 100) : 0;

    // Code density percentage (informational, no longer penalized unconditionally)
    const codeDensity = totalTokens > 0 ? Math.min(100, Math.round((totalCodeTokens / totalTokens) * 100)) : 0;

    // ===== Five-signal computation =====

    // 1. Capacity Pressure (Cp): how full the context window is
    const Cp = Math.min(100, (totalTokens / contextLimit) * 100);

    // 2. Redundancy Index (Ri): sliding-window n-gram repetition
    const Ri = MetricsCalculator.calculateRedundancy(messages);

    // 3. Information Gain Decay (Id): recent turns adding new info vs restating
    const Id = MetricsCalculator.calculateInfoDecay(messages);

    // 4. Turn Depth Factor (Td): turns relative to effective attention span
    const Td = MetricsCalculator.calculateTurnDepth(turnCount, totalTokens, contextLimit);

    // 5. Code Repetition Density (Dr): repeated code blocks vs unique code
    const Dr = MetricsCalculator.calculateCodeRepetition(messages);

    // Composite scores
    const rawBloat = 0.35 * Cp + 0.30 * Ri + 0.15 * Id + 0.10 * Td + 0.10 * Dr;
    const rawRot = 0.25 * Cp + 0.20 * Ri + 0.25 * Id + 0.20 * Td + 0.10 * Dr;
    const bloatScore = Math.min(100, Math.round(rawBloat));
    const rotScore = Math.min(100, Math.round(rawRot));
    const healthScore = Math.max(bloatScore, rotScore);

    // Status tier (SPEC-1 §4.2.4)
    const statusLevel = MetricsCalculator.classifyStatus(healthScore);

    const remainingTokens = Math.max(0, contextLimit - totalTokens);
    const capacityUsed = Math.round(Cp);

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
      capacityUsed,
      // New SPEC-1 fields
      healthScore,
      bloatScore,
      rotScore,
      signals: {
        capacityPressure: Math.round(Cp),
        redundancyIndex: Math.round(Ri),
        infoDecay: Math.round(Id),
        turnDepth: Math.round(Td),
        codeRepetition: Math.round(Dr)
      },
      statusLevel,
      contextLimit,
      remainingTokens,
      // Back-compat alias (replaced by contextLimit in v1.1)
      softLimit: contextLimit
    };
  }

  /**
   * Redundancy Index (Ri): sliding-window n-gram repetition detection.
   * @param {Array} messages
   * @returns {number} 0-100
   */
  static calculateRedundancy(messages) {
    const NGRAM_SIZE = 5;
    // Cap the shingle set so very long conversations don't build a ~5MB Set
    // on every 500ms debounced scan (IMP-1).
    const MAX_SHINGLES = 50000;
    const allShingles = new Set();
    let totalShingles = 0;
    let repeatedShingles = 0;

    for (const msg of messages) {
      const words = (msg.text || '').toLowerCase().split(/\s+/);
      for (let i = 0; i <= words.length - NGRAM_SIZE; i++) {
        const shingle = words.slice(i, i + NGRAM_SIZE).join(' ');
        totalShingles++;
        if (allShingles.has(shingle)) {
          repeatedShingles++;
        } else if (allShingles.size < MAX_SHINGLES) {
          allShingles.add(shingle);
        }
      }
    }

    return totalShingles > 0
      ? Math.min(100, (repeatedShingles / totalShingles) * 200)
      : 0;
  }

  /**
   * Information Gain Decay (Id): average vocab gain of the last 4 turns vs
   * the first 4 turns.
   * @param {Array} messages
   * @returns {number} 0-100
   */
  static calculateInfoDecay(messages) {
    // Require at least 6 messages so the "early" (first 4) and "late"
    // (last 4) windows are distinct; a 4-message conversation would compare
    // the same array against itself and always yield 0 (IMP-2).
    if (!messages || messages.length < 6) return 0;

    const globalVocab = new Set();
    const recentGainRates = [];

    for (const msg of messages) {
      const words = new Set(
        (msg.text || '')
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3)
      );
      const newWords = [...words].filter((w) => !globalVocab.has(w));
      const gainRate = words.size > 0 ? newWords.length / words.size : 0;
      recentGainRates.push(gainRate);
      words.forEach((w) => globalVocab.add(w));
    }

    // Skip the first message when computing the early baseline — its vocab is
    // ~100% new by definition, which skews earlyAvg very high (IMP-2).
    const last4 = recentGainRates.slice(-4);
    const first4 = recentGainRates.slice(1, 5);
    const recentAvg = last4.reduce((a, b) => a + b, 0) / last4.length;
    const earlyAvg = first4.reduce((a, b) => a + b, 0) / first4.length;

    const decay = earlyAvg > 0 ? Math.max(0, 1 - recentAvg / earlyAvg) : 0;
    return Math.min(100, decay * 100);
  }

  /**
   * Turn Depth Factor (Td): conversation length relative to the effective
   * attention span (contextLimit / avgTokensPerTurn). Falls back to a
   * default of 800 tokens/turn when the conversation is short.
   * @param {number} turnCount
   * @param {number} totalTokens
   * @param {number} contextLimit
   * @returns {number} 0-100
   */
  static calculateTurnDepth(turnCount, totalTokens, contextLimit) {
    if (!turnCount) return 0;
    const avgTokensPerTurn = Math.round(totalTokens / turnCount) || MetricsCalculator.DEFAULT_TOKENS_PER_TURN;
    const effectiveMaxTurns = Math.max(1, contextLimit / avgTokensPerTurn);
    return Math.min(100, (turnCount / effectiveMaxTurns) * 100);
  }

  /**
   * Code Repetition Density (Dr): only repeated code blocks are penalized.
   * @param {Array} messages
   * @returns {number} 0-100
   */
  static calculateCodeRepetition(messages) {
    const codeBlocks = [];
    for (const msg of messages || []) {
      if (msg.codeText) {
        const normalized = msg.codeText.trim().replace(/\s+/g, ' ');
        if (normalized.length > 20) codeBlocks.push(normalized);
      }
    }

    if (codeBlocks.length <= 1) return 0;

    const unique = new Set(codeBlocks);
    const dupeRatio = 1 - unique.size / codeBlocks.length;
    return Math.min(100, dupeRatio * 100);
  }

  /**
   * Classifies the combined health score into the SPEC-1 §4.2.4 four tiers.
   * @param {number} score
   * @returns {'optimal'|'dense'|'degrading'|'bloated'}
   */
  static classifyStatus(score) {
    if (score >= 85) return 'bloated';
    if (score >= 65) return 'degrading';
    if (score >= 40) return 'dense';
    return 'optimal';
  }
}

OmniContext.MetricsCalculator = MetricsCalculator;
