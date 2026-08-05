/**
 * OmniContext Metrics Presentation Helpers
 * Shared derivations for the two metric surfaces (overlay HUD and popup):
 * health-score resolution, SPEC-1 §4.2.4 status tiers/colors, capacity tiers,
 * and formatted token counts. Keeps the 85/65/40 thresholds defined once, in
 * MetricsCalculator.classifyStatus.
 */
(function (root) {
  'use strict';

  const OmniContext = root.OmniContext = root.OmniContext || {};

  const STATUS_COLORS = {
    optimal: '#4ade80',
    dense: '#facc15',
    degrading: '#f97316',
    bloated: '#f87171'
  };

  class MetricsView {
    /**
     * Combined health score, falling back to the pre-v1.1 bloat-only score.
     * @param {Object} metrics
     * @returns {number}
     */
    static resolveHealthScore(metrics) {
      if (!metrics) return 0;
      return metrics.healthScore !== undefined ? metrics.healthScore : metrics.bloatScore;
    }

    /**
     * Status tier for an arbitrary score (same thresholds as statusLevel).
     * @param {number} score
     * @returns {'optimal'|'dense'|'degrading'|'bloated'}
     */
    static statusTier(score) {
      return OmniContext.MetricsCalculator.classifyStatus(score);
    }

    /**
     * @param {string} statusLevel
     * @returns {string} Hex color for the tier.
     */
    static statusColor(statusLevel) {
      return STATUS_COLORS[statusLevel] || STATUS_COLORS.optimal;
    }

    /**
     * Capacity-bar tier; each surface maps the tier to its own palette.
     * @param {number} capacityUsed Percentage 0-100.
     * @returns {'high'|'medium'|'low'}
     */
    static capacityTier(capacityUsed) {
      if (capacityUsed > 80) return 'high';
      if (capacityUsed > 50) return 'medium';
      return 'low';
    }

    /**
     * Formats the token counts both surfaces display.
     * @param {Object} metrics
     * @returns {{ limit: string, total: string, remaining: string }}
     */
    static formatTokenCounts(metrics) {
      const format = OmniContext.ModelRegistry.formatTokenCount;
      return {
        limit: format(metrics.contextLimit || metrics.softLimit),
        total: format(metrics.totalTokens),
        remaining: format(metrics.remainingTokens)
      };
    }
  }

  MetricsView.STATUS_COLORS = STATUS_COLORS;

  OmniContext.MetricsView = MetricsView;
})(globalThis);
