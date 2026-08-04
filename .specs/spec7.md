# SPEC-7: OmniContext v1.2 — Roadmap & Feature Design

**Spec Version:** 7.0.0  
**Date:** 2026-08-04  
**Status:** Design  
**Relates To:** [SPEC-3](./spec3.md) (Roadmap proposal) → [SPEC-6](./spec6.md) (v1.1 stability achieved)

---

## 1. Overview

With the v1.1 foundation stabilized (cross-browser compatibility, Shadow DOM interaction, and robust polyfill-free execution), the focus shifts to the **v1.2 feature set**. 

This specification details the design for the three highest-impact features proposed in SPEC-3:
1. **Signal Breakdown Panel (FEAT-1 & FEAT-2)**
2. **Session History & Degradation Tracking (FEAT-3)**
3. **Context-Aware Migration Prompts (FEAT-6)**

---

## 2. Feature Designs

### 2.1 Signal Breakdown Panel (FEAT-1 & FEAT-2)

**Goal:** Users currently see a single composite Health/Bloat/Rot score. We need to expose the 5 underlying signals (`Cp`, `Ri`, `Id`, `Td`, `Dr`) so users understand *why* their context is degrading and receive actionable advice.

**UI Implementation (`src/popup/popup.html` & `popup.css`):**
- Add an expandable accordion section in the popup: `📊 Signal Breakdown`.
- Render 5 horizontal progress bars (0-100 scale).
- Color code the bars (Green < 40, Yellow 40-65, Orange 65-85, Red > 85).

**Actionable Advice (Tooltips):**
Hovering over a signal bar will display dynamic advice based on its value:
- **Capacity (Cp) > 85:** "Context limit almost reached. Prepare to migrate."
- **Redundancy (Ri) > 50:** "High repetition detected. Ask the model to summarize previous context."
- **Info Decay (Id) > 60:** "Recent messages lack new information. Consider starting fresh."
- **Turn Depth (Td) > 80:** "Long conversation. The model's attention span may be diluting."
- **Code Repetition (Dr) > 40:** "Identical code blocks repeated. Reference code by name instead of pasting."

### 2.2 Session History & Degradation Tracking (FEAT-3)

**Goal:** Metrics currently represent a point-in-time snapshot. We need to track the *rate* of degradation over the lifetime of a session to predict when bloat will become critical.

**Storage Schema (`storage.local`):**
```javascript
{
  "history_<tabId>": {
    sessionId: "uuid-string",
    platform: "chatgpt",
    model: "GPT-4.1",
    snapshots: [
      { timestamp: 1722787200000, health: 12, bloat: 10, rot: 12, tokens: 3400 },
      { timestamp: 1722787500000, health: 25, bloat: 22, rot: 25, tokens: 8200 }
      // Max 50 snapshots (rolling window)
    ]
  }
}
```

**Data Flow (`src/background/serviceWorker.js`):**
- Intercept `OMNI_METRICS_UPDATE`.
- If the current timestamp is > 60 seconds since the last snapshot, push a new snapshot to the array.
- Limit the array to 50 entries to prevent storage bloat.

**UI Visualization:**
- In the popup, render a simple SVG sparkline chart above the main health ring.
- Plot the `health` score over time.
- Calculate and display a trend arrow (e.g., `↗ +5% in last 10 mins`).

### 2.3 Context-Aware Migration Prompts (FEAT-6)

**Goal:** The current migration prompt (`MigrationPromptEngine.getPromptText()`) is a static string. It should dynamically adapt to the specific signals causing the bloat.

**Logic Update (`src/core/migrationPrompt.js`):**
Modify `getPromptText(metrics)` to inject specific instructions based on the signal breakdown.

```javascript
static getPromptText(metrics, modelName) {
  let prompt = `We are reaching memory context limits (${metrics.capacityUsed}% capacity) on ${modelName}. `;
  prompt += `Our Health Score is currently ${metrics.healthScore}/100. `;
  
  // Dynamic instructions based on signals
  if (metrics.signals.redundancyIndex > 40) {
    prompt += 'There is significant content repetition — please deduplicate and consolidate. ';
  }
  if (metrics.signals.infoDecay > 50) {
    prompt += 'Recent turns have had low information gain — focus the summary only on the latest decisions. ';
  }
  if (metrics.signals.codeRepetition > 40) {
    prompt += 'Please list code file structures rather than repeating full implementation blocks. ';
  }
  
  prompt += '\nPlease generate a structured Markdown summary of our discussion, including key requirements and architectural decisions, so I can paste it into a fresh session.';
  
  return prompt;
}
```

**Integration:**
- The Shadow DOM UI (`shadowContainer.js`) and Popup (`popup.js`) must pass the active `metrics` and `modelName` to the prompt engine when the "Prepare Summary" button is clicked.

---

## 3. Implementation Plan & Phases

**Phase 1: Dynamic Prompts (FEAT-6)**
- Quickest win with highest immediate utility.
- Update `migrationPrompt.js`.
- Update `shadowContainer.js` click handler to pass `this.latestMetrics`.

**Phase 2: Signal Breakdown UI (FEAT-1/2)**
- Requires DOM/CSS additions in the popup.
- Update `popup.js` to render the 5 progress bars using the existing `metrics.signals` object.

**Phase 3: Session History (FEAT-3)**
- Requires background script state management.
- Requires SVG rendering logic in the popup for the sparkline.
- Care must be taken to cleanup stale tab histories in `chrome.tabs.onRemoved`.
