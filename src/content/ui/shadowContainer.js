/**
 * OmniContext Shadow DOM HUD Component
 * Self-contained, draggable, resizable, and removable UI component displaying live context metrics.
 */

import { MigrationPromptEngine } from '../core/migrationPrompt.js';
import { ModelRegistry } from '../../core/modelRegistry.js';

export class ShadowContainer {
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

        .omni-hud-root {
          position: fixed; top: 20px; right: 20px; z-index: 2147483647;
          user-select: none; font-size: 13px; color: #f8fafc; direction: ltr;
        }

        .omni-badge {
          display: flex; align-items: center; gap: 8px; padding: 6px 12px;
          background: rgba(15, 23, 42, 0.94); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 30px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(56, 189, 248, 0.2);
          cursor: grab; transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;
        }

        .omni-badge:hover {
          border-color: rgba(56, 189, 248, 0.6);
          box-shadow: 0 12px 30px -5px rgba(0, 0, 0, 0.7), 0 0 22px rgba(56, 189, 248, 0.4);
        }

        .omni-badge:active { cursor: grabbing; }

        .omni-drag-handle {
          color: #64748b; font-size: 14px; font-weight: 900; letter-spacing: -2px;
          cursor: grab; padding: 0 2px; user-select: none;
        }
        .omni-drag-handle:hover { color: #38bdf8; }

        .omni-close-btn {
          background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8; font-size: 13px; font-weight: 700; cursor: pointer;
          width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center;
          justify-content: center; line-height: 1; margin-left: 4px;
          transition: all 0.15s ease; flex-shrink: 0;
        }
        .omni-close-btn:hover { background: #ef4444; color: #ffffff; border-color: #ef4444; }

        .omni-status-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
        .omni-status-optimal { background: #4ade80; box-shadow: 0 0 8px #4ade80; }
        .omni-status-dense { background: #facc15; box-shadow: 0 0 8px #facc15; }
        .omni-status-bloated { background: #f87171; box-shadow: 0 0 10px #f87171; animation: pulse 1.2s infinite; }

        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.2); } 100% { transform: scale(1); } }

        .omni-divider { width: 1px; height: 14px; background: rgba(255, 255, 255, 0.2); }

        .omni-card {
          margin-top: 10px; width: 320px; min-width: 260px; min-height: 220px;
          max-width: 600px; max-height: 850px; resize: both; overflow: auto;
          background: rgba(15, 23, 42, 0.96); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 16px;
          padding: 16px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7);
          display: flex; flex-direction: column; gap: 12px;
          animation: omni-fade-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

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

        .omni-btn {
          background: linear-gradient(135deg, #0284c7, #4f46e5); color: #ffffff;
          border: none; border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 600;
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;
          transition: filter 0.15s ease;
        }

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
              <span class="omni-card-title" id="omni-model-title">Gemini 1.5 Pro</span>
              <span class="omni-card-platform" id="omni-platform-badge">Gemini</span>
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <button class="omni-close-btn" id="omni-card-minimize" title="Minimize Dashboard" style="font-size: 14px;">−</button>
              <button class="omni-close-btn" id="omni-card-close" title="Close / Hide Overlay">✕</button>
            </div>
          </div>

          <div class="omni-metric-row">
            <div class="omni-metric-label">
              <span>Capacity Used</span>
              <span id="omni-cap-text">0 / 1M (0%)</span>
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
            <div class="omni-stat-box">
              <span class="omni-stat-val" id="omni-stat-turns">0</span>
              <span class="omni-stat-lbl">Turns / Messages</span>
            </div>
            <div class="omni-stat-box">
              <span class="omni-stat-val" id="omni-stat-code">0%</span>
              <span class="omni-stat-lbl">Code Density</span>
            </div>
            <div class="omni-stat-box">
              <span class="omni-stat-val" id="omni-stat-ratio">50/50</span>
              <span class="omni-stat-lbl">User / Assist Ratio</span>
            </div>
            <div class="omni-stat-box">
              <span class="omni-stat-val" id="omni-stat-status">Optimal</span>
              <span class="omni-stat-lbl">Health Level</span>
            </div>
          </div>

          <button class="omni-btn" id="omni-migrate-btn">Prepare Context Summary</button>
        </div>
      </div>
    `;

    const badgeBtn = this.shadowRoot.getElementById('omni-badge-btn');
    badgeBtn.addEventListener('click', (e) => {
      if (e.target.closest('.omni-close-btn')) return;
      if (this.wasDragging) {
        this.wasDragging = false;
        return;
      }
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
      if (this.onPrepareSummary) {
        this.onPrepareSummary();
      } else {
        MigrationPromptEngine.injectPromptIntoInput();
      }
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
    if (metrics.capacityUsed > 80) capBar.style.background = '#f87171';
    else if (metrics.capacityUsed > 50) capBar.style.background = '#facc15';
    else capBar.style.background = '#38bdf8';

    this.shadowRoot.getElementById('omni-bloat-text').innerText = `${metrics.bloatScore} / 100 (${metrics.statusLevel.toUpperCase()})`;

    const bloatBar = this.shadowRoot.getElementById('omni-bloat-bar');
    bloatBar.style.width = `${metrics.bloatScore}%`;
    if (metrics.bloatScore >= 75) bloatBar.style.background = '#f87171';
    else if (metrics.bloatScore >= 50) bloatBar.style.background = '#facc15';
    else bloatBar.style.background = '#4ade80';

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

    let isMouseDown = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.omni-close-btn')) return;
      isMouseDown = true;
      this.wasDragging = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = root.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      root.style.right = 'auto';
      root.style.left = `${initialLeft}px`;
      root.style.top = `${initialTop}px`;
      e.preventDefault();
    };

    if (badge) badge.addEventListener('mousedown', onMouseDown);
    if (cardHeader) cardHeader.addEventListener('mousedown', onMouseDown);

    window.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.wasDragging = true;
      const newLeft = Math.max(10, Math.min(window.innerWidth - 100, initialLeft + dx));
      const newTop = Math.max(10, Math.min(window.innerHeight - 50, initialTop + dy));
      root.style.left = `${newLeft}px`;
      root.style.top = `${newTop}px`;
    });

    window.addEventListener('mouseup', () => { isMouseDown = false; });
  }
}
