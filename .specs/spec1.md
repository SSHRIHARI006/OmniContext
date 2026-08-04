# SPEC-1: OmniContext v1.1 — Cross-Browser, Accurate Model Detection & Bloat/Rot Overhaul

**Spec Version:** 1.2.0  
**Date:** 2026-08-04  
**Status:** Draft — Awaiting Review  

---

## 1. Objective

Three targeted upgrades to OmniContext:

| # | Area | Problem |
|---|------|---------|
| 1 | **Browser Agnosticism** | Current manifest has Firefox-specific quirks (`background.scripts` + `service_worker` coexist) and lacks explicit testing/polyfill strategy for Edge, Brave, Opera, Vivaldi, Arc. |
| 2 | **Accurate Model Detection** | Adapters use fragile CSS selectors that break on UI updates; model registry is stale (missing GPT-4.1, o3, o4-mini, Claude 4/Opus 4, Gemini 2.5 Pro, DeepSeek-V3 0324, etc.). |
| 3 | **Context Bloat & Rot Formula** | Current formula is a simplistic weighted average of capacity + turns + code-density. It ignores repetition, information decay, semantic redundancy, and the "Lost in the Middle" phenomenon backed by 2025-2026 research. |

---

## 2. Cross-Browser Compatibility

### 2.1 Current Issues

1. **Manifest conflict:** `background` block has both `service_worker` (Chrome) and `scripts` (Firefox). Only one should be present per target; use build-time filtering or conditional fields.
2. **API namespace:** Code uses `typeof browser !== 'undefined' ? browser : chrome` — correct pattern but needs standardization via the `webextension-polyfill` library for promise-based APIs.
3. **No automated cross-browser testing** — manual QA only.

### 2.2 Target Browsers

| Browser | Engine | MV3 Status | Notes |
|---------|--------|------------|-------|
| Chrome 120+ | Chromium | Full MV3 | Primary target |
| Edge 120+ | Chromium | Full MV3 | Follows Chrome |
| Brave 1.60+ | Chromium | Full MV3 | Shields don't affect extensions |
| Firefox 140+ | Gecko | MV3 + extras | Supports `browser.*` natively, keeps blocking `webRequest` |
| Opera 105+ | Chromium | Full MV3 | Chrome-compatible |
| Vivaldi 6.5+ | Chromium | Full MV3 | Chrome-compatible |
| Arc | Chromium | Full MV3 | Chrome-compatible |

### 2.3 Implementation Plan

#### 2.3.1 Build Pipeline — Manifest Filtering

Introduce a simple Node build script (`scripts/build.js`) that produces two manifests from a single `manifest.base.json`:

- **`manifest.chrome.json`** — `background.service_worker` only, no `browser_specific_settings`.
- **`manifest.firefox.json`** — `background.scripts` array, includes `browser_specific_settings.gecko`.

```
npm run build:chrome   → dist/chrome/
npm run build:firefox  → dist/firefox/
```

All Chromium-based browsers (Edge, Brave, Opera, Vivaldi, Arc) use the Chrome build.

#### 2.3.2 API Polyfill

Add `webextension-polyfill` as a dependency. Replace all manual `browser`/`chrome` detection:

```javascript
// BEFORE (current)
const extApi = typeof browser !== 'undefined' ? browser : chrome;

// AFTER
import browser from 'webextension-polyfill';
// `browser` now works identically on Chrome, Firefox, Edge, Brave
```

**Files to update:** `content.js`, `serviceWorker.js`, `popup.js`, all adapters that reference `extApi`.

#### 2.3.3 Storage API Harmonization

Current code has dual codepaths (Promise vs callback) for `storage.local.get`. With the polyfill, collapse to a single Promise path:

```javascript
// Unified
const result = await browser.storage.local.get('extensionEnabled');
```

#### 2.3.4 Badge API Compatibility

Current code already checks for `action` vs `browserAction` — good. The polyfill handles this. Keep the fallback but simplify:

```javascript
const actionApi = browser.action || browser.browserAction;
```

#### 2.3.5 Cross-Browser Test Matrix

| Test Case | Chrome | Firefox | Edge | Brave |
|-----------|--------|---------|------|-------|
| Extension installs cleanly | ☐ | ☐ | ☐ | ☐ |
| Content script injects on all 6 platforms | ☐ | ☐ | ☐ | ☐ |
| Popup opens and displays metrics | ☐ | ☐ | ☐ | ☐ |
| Storage toggle persists across sessions | ☐ | ☐ | ☐ | ☐ |
| Badge updates in real-time | ☐ | ☐ | ☐ | ☐ |
| Shadow DOM widget renders without CSS leaks | ☐ | ☐ | ☐ | ☐ |

---

## 3. Accurate Model Detection

### 3.1 Current Issues

1. **Stale selectors:** ChatGPT's `[data-testid="model-switcher-dropdown-button"]` and Claude's `button[data-testid="model-selector"]` break frequently on UI updates.
2. **Static fallbacks:** Each adapter falls back to a hardcoded model name (e.g., `'GPT-4o'`, `'Claude 3.5 Sonnet'`) which is wrong when users are on newer models.
3. **Outdated registry:** Missing GPT-4.1, o3, o4-mini, Claude Opus 4, Claude 4.6/4.8, Gemini 2.5 Pro/Flash, DeepSeek-R1-0528.

### 3.2 Two-Layer Detection Strategy

#### Layer 1: Network Interception (Primary — Most Reliable)

Inject a **main-world content script** that monkey-patches `window.fetch` and `XMLHttpRequest` to intercept API calls and extract the model ID directly from request/response payloads.

```javascript
// Injected into MAIN world via manifest.json "world": "MAIN"
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const [url, options] = args;
  const response = await originalFetch(...args);
  
  // Detect model from outgoing request body
  if (options?.body) {
    try {
      const body = JSON.parse(options.body);
      if (body.model) {
        window.postMessage({
          type: 'OMNI_MODEL_DETECTED',
          modelId: body.model,
          source: 'fetch_request'
        }, '*');
      }
    } catch {}
  }
  
  // Also check response metadata
  try {
    const clone = response.clone();
    const data = await clone.json();
    if (data.model) {
      window.postMessage({
        type: 'OMNI_MODEL_DETECTED',
        modelId: data.model,
        source: 'fetch_response'
      }, '*');
    }
  } catch {}
  
  return response;
};
```

The **isolated-world content script** listens via `window.addEventListener('message', ...)` and forwards to the adapter.

**Manifest change:**
```json
"content_scripts": [
  {
    "matches": ["*://*.chatgpt.com/*", "..."],
    "js": ["src/content/interceptor.js"],
    "world": "MAIN",
    "run_at": "document_start"
  },
  {
    "matches": ["*://*.chatgpt.com/*", "..."],
    "js": ["src/content/content.bundle.js"],
    "run_at": "document_end"
  }
]
```

> **⚠️ IMPORTANT:** Firefox MV3 does not support the `"world": "MAIN"` field in `content_scripts`. For Firefox, inject the interceptor script dynamically via `document.createElement('script')` with `src` set to the web-accessible resource.

#### Layer 2: DOM Scraping (Fallback — Resilient Selectors)

Keep DOM scraping as a fallback, but make selectors more resilient:

1. **Use `data-testid` and `aria-*` attributes first** — these are more stable than class names.
2. **Use text-content matching** — search for model name patterns in visible text near known UI regions.
3. **Cascade through multiple selectors** — already done, but expand the lists.
4. **Add a MutationObserver on the model selector area** to re-detect on model switch.

### 3.3 Updated Model Registry (August 2026)

```javascript
static MODELS = [
  // === Gemini ===
  { pattern: /gemini.*2\.5.*pro/i,   name: 'Gemini 2.5 Pro',   limit: 1000000, platform: 'gemini', multiplier: 1.05 },
  { pattern: /gemini.*2\.5.*flash/i, name: 'Gemini 2.5 Flash',  limit: 1000000, platform: 'gemini', multiplier: 1.05 },
  { pattern: /gemini.*2\.0.*flash/i, name: 'Gemini 2.0 Flash',  limit: 1000000, platform: 'gemini', multiplier: 1.05 },
  { pattern: /gemini.*1\.5.*pro/i,   name: 'Gemini 1.5 Pro',    limit: 2000000, platform: 'gemini', multiplier: 1.05 },
  { pattern: /gemini.*1\.5/i,        name: 'Gemini 1.5 Flash',   limit: 1000000, platform: 'gemini', multiplier: 1.05 },
  { pattern: /gemini/i,              name: 'Gemini (default)',    limit: 1000000, platform: 'gemini', multiplier: 1.05 },

  // === OpenAI / ChatGPT ===
  { pattern: /gpt-?4\.?1/i,          name: 'GPT-4.1',           limit: 1000000, platform: 'chatgpt', multiplier: 1.00 },
  { pattern: /gpt-?4o-?mini/i,       name: 'GPT-4o mini',       limit: 128000,  platform: 'chatgpt', multiplier: 1.00 },
  { pattern: /gpt-?4o/i,             name: 'GPT-4o',            limit: 128000,  platform: 'chatgpt', multiplier: 1.00 },
  { pattern: /o4-?mini/i,            name: 'o4-mini',           limit: 200000,  platform: 'chatgpt', multiplier: 1.00 },
  { pattern: /o3-?mini/i,            name: 'o3-mini',           limit: 200000,  platform: 'chatgpt', multiplier: 1.00 },
  { pattern: /o3/i,                  name: 'o3',                limit: 200000,  platform: 'chatgpt', multiplier: 1.00 },
  { pattern: /o1-?mini/i,            name: 'o1-mini',           limit: 128000,  platform: 'chatgpt', multiplier: 1.00 },
  { pattern: /o1/i,                  name: 'o1',                limit: 200000,  platform: 'chatgpt', multiplier: 1.00 },
  { pattern: /gpt-?4/i,              name: 'GPT-4',             limit: 128000,  platform: 'chatgpt', multiplier: 1.00 },
  { pattern: /chatgpt/i,             name: 'ChatGPT (GPT-4o)',  limit: 128000,  platform: 'chatgpt', multiplier: 1.00 },

  // === Claude (Anthropic) ===
  { pattern: /claude.*opus.*4/i,           name: 'Claude Opus 4',       limit: 200000, platform: 'claude', multiplier: 1.15 },
  { pattern: /claude.*sonnet.*4/i,         name: 'Claude Sonnet 4',     limit: 200000, platform: 'claude', multiplier: 1.15 },
  { pattern: /claude.*4/i,                 name: 'Claude 4',            limit: 200000, platform: 'claude', multiplier: 1.15 },
  { pattern: /claude.*3\.7/i,              name: 'Claude 3.7 Sonnet',   limit: 200000, platform: 'claude', multiplier: 1.15 },
  { pattern: /claude.*3\.5.*sonnet/i,      name: 'Claude 3.5 Sonnet',   limit: 200000, platform: 'claude', multiplier: 1.15 },
  { pattern: /claude.*3/i,                 name: 'Claude 3',            limit: 200000, platform: 'claude', multiplier: 1.15 },
  { pattern: /claude/i,                    name: 'Claude (default)',     limit: 200000, platform: 'claude', multiplier: 1.15 },

  // === DeepSeek ===
  { pattern: /deepseek.*r1/i,        name: 'DeepSeek-R1',       limit: 128000, platform: 'deepseek', multiplier: 1.10 },
  { pattern: /deepseek.*v3/i,        name: 'DeepSeek-V3',       limit: 128000, platform: 'deepseek', multiplier: 1.10 },
  { pattern: /deepseek/i,            name: 'DeepSeek (default)', limit: 128000, platform: 'deepseek', multiplier: 1.10 },

  // === Kimi ===
  { pattern: /k1\.5|kimi.*k1/i,      name: 'Kimi K1.5',         limit: 2000000, platform: 'kimi', multiplier: 1.10 },
  { pattern: /kimi/i,                name: 'Kimi Moonshot',      limit: 128000,  platform: 'kimi', multiplier: 1.10 },

  // === Qwen ===
  { pattern: /qwen.*3/i,             name: 'Qwen 3',            limit: 128000, platform: 'qwen', multiplier: 1.10 },
  { pattern: /qwen.*2\.5/i,          name: 'Qwen 2.5',          limit: 128000, platform: 'qwen', multiplier: 1.10 },
  { pattern: /qwen/i,                name: 'Qwen (default)',     limit: 128000, platform: 'qwen', multiplier: 1.10 },
];
```

> **NOTE:** The `softLimit` field is removed. Research shows the advertised context limit IS the hard limit; the effective degradation point is modeled by the new Bloat/Rot formula (Section 4) rather than an arbitrary soft cap.

### 3.4 Adapter Updates Required

Each adapter's `extractModelName()` gets a two-phase approach:

```javascript
// In BaseAdapter — new method
getDetectedModel() {
  // Phase 1: Check if network interceptor already detected a model
  if (this._interceptedModelId) {
    const match = ModelRegistry.getModelByApiId(this._interceptedModelId);
    if (match) return match;
  }
  // Phase 2: Fall back to DOM scraping
  const scrapedText = this.extractModelName();
  return ModelRegistry.getModelInfo(this.platformKey, scrapedText);
}
```

**New file:** `src/content/interceptor.js` — Main-world script for fetch/XHR interception.

---

## 4. Context Bloat & Rot — Formula Overhaul

### 4.1 Problems with Current Formula

The current formula:

```
S_bloat = min(100, 0.60 × C_capacity + 0.20 × T_turn + 0.20 × D_code)
```

**Issues identified:**

| Problem | Detail |
|---------|--------|
| **Capacity is over-weighted at 60%** | A conversation at 60% capacity with zero redundancy scores 36 — already approaching "dense" despite being healthy. |
| **Turn count is a poor proxy** | 30 turns is the ceiling, but 30 concise turns ≠ 30 verbose turns. Turn count alone says nothing about quality. |
| **Code density is penalized unconditionally** | High code density is not inherently "bloated." Clean code with no repetition is healthy context. |
| **No redundancy detection** | The formula cannot distinguish between 50k tokens of unique content vs 50k tokens where half is repetitive boilerplate. |
| **No "rot" signal** | Research shows performance degrades BEFORE hitting capacity limits. The formula has no temporal/positional decay modeling. |
| **No information gain tracking** | The formula treats every turn equally regardless of whether it adds new information or restates old context. |

### 4.2 Research-Backed New Model

Based on 2025-2026 research ("Lost in the Middle" — Liu et al., Context Rot — Chroma 2025, attention dilution studies), we propose a **five-signal composite score** that separately models **Bloat** (how full/redundant the context is) and **Rot** (how likely the model is to lose information).

#### 4.2.1 New Signals

| Signal | Symbol | What It Measures | Range |
|--------|--------|-----------------|-------|
| **Capacity Pressure** | Cp | How full is the context window | 0–100 |
| **Redundancy Index** | Ri | How repetitive/redundant is the content | 0–100 |
| **Information Gain Decay** | Id | Are recent turns adding new info or restating old | 0–100 |
| **Turn Depth Factor** | Td | Conversation length relative to effective attention span | 0–100 |
| **Code Repetition Density** | Dr | Repeated code blocks vs unique code | 0–100 |

#### 4.2.2 Signal Definitions

**1. Capacity Pressure (Cp)**
```
Cp = min(100, (totalTokens / contextLimit) × 100)
```
Same as before, but now uses the model's actual context limit (not an arbitrary soft limit).

**2. Redundancy Index (Ri) — NEW**

Uses sliding-window n-gram repetition detection (computable locally, no embeddings needed):

```javascript
static calculateRedundancy(messages) {
  const NGRAM_SIZE = 5;  // 5-word shingles
  const allShingles = new Set();
  let totalShingles = 0;
  let repeatedShingles = 0;

  for (const msg of messages) {
    const words = msg.text.toLowerCase().split(/\s+/);
    for (let i = 0; i <= words.length - NGRAM_SIZE; i++) {
      const shingle = words.slice(i, i + NGRAM_SIZE).join(' ');
      totalShingles++;
      if (allShingles.has(shingle)) {
        repeatedShingles++;
      } else {
        allShingles.add(shingle);
      }
    }
  }

  return totalShingles > 0
    ? Math.min(100, (repeatedShingles / totalShingles) * 200)  // scaled x2
    : 0;
}
```

**3. Information Gain Decay (Id) — NEW**

Measures whether recent turns contribute new vocabulary or restate existing content:

```javascript
static calculateInfoDecay(messages) {
  if (messages.length < 4) return 0;

  const globalVocab = new Set();
  const recentGainRates = [];
  
  for (const msg of messages) {
    const words = new Set(msg.text.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const newWords = [...words].filter(w => !globalVocab.has(w));
    const gainRate = words.size > 0 ? newWords.length / words.size : 0;
    recentGainRates.push(gainRate);
    words.forEach(w => globalVocab.add(w));
  }

  // Average info gain of last 4 turns vs first 4 turns
  const last4 = recentGainRates.slice(-4);
  const first4 = recentGainRates.slice(0, 4);
  const recentAvg = last4.reduce((a, b) => a + b, 0) / last4.length;
  const earlyAvg = first4.reduce((a, b) => a + b, 0) / first4.length;
  
  const decay = earlyAvg > 0 ? Math.max(0, 1 - (recentAvg / earlyAvg)) : 0;
  return Math.min(100, decay * 100);
}
```

**4. Turn Depth Factor (Td)**

Instead of a flat `turns / 30` ratio, model it against the context limit:

```
effectiveMaxTurns = contextLimit / avgTokensPerTurn
Td = min(100, (turnCount / effectiveMaxTurns) × 100)
```

If `avgTokensPerTurn` is unknown (early in conversation), use a default of 800 tokens/turn.

**5. Code Repetition Density (Dr)**

Only penalize *repeated* code, not all code:

```javascript
static calculateCodeRepetition(messages) {
  const codeBlocks = [];
  for (const msg of messages) {
    if (msg.codeText) {
      const normalized = msg.codeText.trim().replace(/\s+/g, ' ');
      if (normalized.length > 20) codeBlocks.push(normalized);
    }
  }
  
  if (codeBlocks.length <= 1) return 0;
  
  const unique = new Set(codeBlocks);
  const dupeRatio = 1 - (unique.size / codeBlocks.length);
  return Math.min(100, dupeRatio * 100);
}
```

#### 4.2.3 New Composite Formulas

**Context Bloat Score** (how saturated/redundant the context is):

```
S_bloat = min(100, 0.35×Cp + 0.30×Ri + 0.15×Id + 0.10×Td + 0.10×Dr)
```

**Context Rot Score** (how likely the model is losing information — "Lost in the Middle"):

```
S_rot = min(100, 0.25×Cp + 0.20×Ri + 0.25×Id + 0.20×Td + 0.10×Dr)
```

**Combined Health Score** (displayed to user):

```
S_health = max(S_bloat, S_rot)
```

#### 4.2.4 New Status Tiers

| Range | Status | Description |
|-------|--------|-------------|
| 0–39 | 🟢 **Optimal** | High retention, low redundancy, healthy information gain |
| 40–64 | 🟡 **Dense** | Moderate redundancy or attention dilution risk |
| 65–84 | 🟠 **Degrading** | Significant rot detected; consider summarizing |
| 85–100 | 🔴 **Bloated** | Critical — migration strongly recommended |

> **KEY CHANGE:** The threshold for "bloated" moves from 75 → 85 because the new formula is more sensitive (catches real degradation earlier). The new "Degrading" tier (65-84) replaces the dead zone in the old formula.

#### 4.2.5 Why This Is More Accurate

| Old Formula | New Formula |
|-------------|-------------|
| 50k unique tokens at 60% capacity = score 36 ("optimal") even if info gain is zero | Same scenario: if recent turns add no new info, Id pushes score to 50+ ("dense") |
| 30 turns of concise Q&A = same score as 30 turns of repetitive boilerplate | Redundancy index (Ri) distinguishes the two — boilerplate scores 30+ higher |
| Code-heavy conversation penalized regardless of uniqueness | Only repeated code blocks contribute to Dr |
| No decay signal — conversation could be "rotting" but score stays low | Id and Td together model the "Lost in the Middle" decay curve |

### 4.3 UI Changes

The popup and floating widget need to display:
- **Health Score** (combined max of bloat/rot) — replaces old `bloatScore`
- **Bloat indicator** — shown in detail panel
- **Rot indicator** — shown in detail panel
- New "Degrading" status tier with orange color

---

## 5. Files Changed Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `manifest.json` → `manifest.base.json` | RENAME+MODIFY | Template with build-time variables |
| `scripts/build.js` | NEW | Build script producing Chrome/Firefox manifests |
| `package.json` | MODIFY | Add `webextension-polyfill` dep, build scripts |
| `src/content/interceptor.js` | NEW | Main-world fetch/XHR interceptor for model detection |
| `src/core/modelRegistry.js` | MODIFY | Updated model list (Aug 2026), add `getModelByApiId()` |
| `src/core/metricsCalculator.js` | MODIFY | New 5-signal bloat/rot formula |
| `src/content/adapters/baseAdapter.js` | MODIFY | Add `getDetectedModel()` two-phase method |
| `src/content/adapters/chatgptAdapter.js` | MODIFY | Update selectors, integrate interceptor |
| `src/content/adapters/claudeAdapter.js` | MODIFY | Update selectors, integrate interceptor |
| `src/content/adapters/geminiAdapter.js` | MODIFY | Update selectors, integrate interceptor |
| `src/content/adapters/deepseekAdapter.js` | MODIFY | Update selectors |
| `src/content/content.js` | MODIFY | Replace `extApi` with polyfill, listen for interceptor messages |
| `src/background/serviceWorker.js` | MODIFY | Replace `extApi` with polyfill |
| `src/popup/popup.js` | MODIFY | Replace `extApi`, display rot score, 4-tier status |
| `src/content/ui/shadowContainer.js` | MODIFY | Display health score with 4-tier colors |

---

## 6. Verification Plan

### Automated
- `npm run build:chrome` and `npm run build:firefox` produce valid manifests
- Load unpacked in Chrome, Firefox, Edge, Brave — verify no console errors
- Visit each LLM platform, verify model name detected correctly

### Manual
- Open 20+ turn conversations on ChatGPT, Claude, Gemini
- Verify bloat/rot scores are reasonable:
  - Short, concise conversation → less than 30 (Optimal)
  - Long conversation with repetition → 50-70 (Dense/Degrading)
  - Very long conversation restating same context → 85+ (Bloated)
- Switch models mid-conversation → verify model name updates
- Test on Firefox specifically for interceptor fallback (no `"world": "MAIN"`)

---

## 7. Open Questions

**Q1: Safari Support?** Safari's MV3 support has unique constraints (Xcode required for packaging). Recommend deferring to v1.2.

**Q2: CSP Restrictions?** The network interceptor requires injecting into the page's main world. Some platforms may have strict CSP that blocks this. Need to test per platform and accept DOM-only as the fallback.

**Q3: Claude Multiplier?** Changed from `1.18` to `1.15` based on Claude 4's tokenizer being closer to tiktoken than Claude 3's was. Needs empirical validation.

**Q4: Degrading Tier UX?** Should the "Degrading" tier trigger any proactive action (e.g., a subtle warning in the widget), or only show in the popup detail view?
