# SPEC-2: OmniContext v1.1 — SPEC-1 Implementation Summary & Verification

**Spec Version:** 2.0.0
**Date:** 2026-08-04
**Status:** Implemented — Awaiting Cross-Browser QA
**Relates To:** [SPEC-1](./spec1.md) — Cross-Browser, Accurate Model Detection & Bloat/Rot Overhaul

---

## 1. What Was Built

SPEC-1 defined three targeted upgrades to OmniContext. All three are now implemented in the source tree (`src/`), with a generated content-script bundle and per-browser `dist/` outputs.

| # | Area | Status | Primary Files |
|---|------|--------|---------------|
| 1 | Cross-Browser Compatibility (build pipeline, polyfill, storage harmonization) | ✅ Implemented | `manifest.base.json`, `scripts/build.js`, `scripts/bundle-content.js`, `src/background/serviceWorker.js`, `src/popup/popup.js` |
| 2 | Accurate Model Detection (network interceptor + resilient DOM fallback) | ✅ Implemented | `src/content/interceptor.js`, `src/core/modelRegistry.js`, `src/content/adapters/*` |
| 3 | Context Bloat & Rot Formula (5-signal composite, 4 tiers) | ✅ Implemented | `src/core/metricsCalculator.js`, `src/content/ui/shadowContainer.js`, `src/popup/*` |

---

## 2. Cross-Browser Compatibility (§2)

### 2.1 Build Pipeline
- `manifest.base.json` is now the single manifest source of truth (version `1.2.0`, MV3).
- `scripts/build.js` generates browser-specific manifests:
  - **`dist/chrome/`** — `background.service_worker` only, no `browser_specific_settings`. Used by Chrome, Edge, Brave, Opera, Vivaldi, Arc.
  - **`dist/firefox/`** — `background.scripts` array + `browser_specific_settings.gecko` block.
- Commands:
  - `npm run build` → both builds
  - `npm run build:chrome` / `npm run build:firefox` → single build
  - `npm run package` → zip both into `omnicontext-v1.2.0-{chrome,firefox}.zip`

### 2.2 Content Bundle
- The manifest loads `src/content/content.bundle.js`; the source of truth lives in ES modules under `src/`.
- `scripts/bundle-content.js` — a zero-dependency Node bundler that statically resolves the module graph and emits a single IIFE. (esbuild was initially attempted but the local npm registry install proved flaky; the zero-dep bundler removes that failure mode entirely.)
- **Latent bug found & fixed:** `shadowContainer.js` imported `MigrationPromptEngine` from `../core/migrationPrompt.js`, which resolved to the non-existent `src/content/core/`. Corrected to `../../core/migrationPrompt.js`. This only worked before because no strict bundler was in the loop.

### 2.3 Polyfill & Storage Harmonization
- `webextension-polyfill` is a runtime dependency.
- **Background service worker** and **popup** now `import browser from 'webextension-polyfill'` — all `storage.local` / `tabs` / `runtime` calls use the unified Promise API (dual callback/Promise codepaths removed).
- **Content script** deliberately does NOT vendor the polyfill: it can run before the polyfill setup script and already handles the `browser`/`chrome` split via `extApi`. Badge API still uses `browser.action || browser.browserAction`.

---

## 3. Accurate Model Detection (§3)

### 3.1 Network Interceptor (Layer 1 — Primary)
- New `src/content/interceptor.js` — main-world script that monkey-patches `window.fetch` and `XMLHttpRequest`, extracts `model` / `model_id` from request bodies and response payloads, and forwards `window.postMessage({ type: 'OMNI_MODEL_DETECTED', modelId, source })`.
- **Chromium:** loaded via `content_scripts` `"world": "MAIN"` at `document_start` (spec §2.3 manifest change).
- **Firefox:** does not support `"world": "MAIN"`, so `content.js` injects the interceptor dynamically via a `<script>` tag pointed at the web-accessible resource (`src/content/interceptor.js` is registered in `web_accessible_resources`).
- The isolated-world orchestrator listens for the `message` event and calls `adapter.setInterceptedModel(modelId)` + rescan.

### 3.2 Two-Phase Resolution in Adapters
- `BaseAdapter.getDetectedModel()` implements the spec's two-phase flow:
  1. If `_interceptedModelId` resolves via `ModelRegistry.getModelByApiId()` → use it (`source: 'network'`).
  2. Otherwise fall back to `extractModelName()` DOM scraping (`source: 'dom'`).
- `content.js` now calls `getDetectedModel()` instead of `getModelInfo()`.

### 3.3 Updated Model Registry (Aug 2026)
- Full model list from SPEC-1 §3.3 (GPT-4.1, o3, o4-mini, Claude Opus/Sonnet 4, Gemini 2.5 Pro/Flash, DeepSeek-V3/R1, Kimi K1.5, Qwen 3).
- **`softLimit` removed** — `contextLimit` (the advertised hard limit) is now the only capacity bound.
- Each entry carries a per-model `multiplier` (Claude 1.15, Gemini 1.05, DeepSeek/Kimi/Qwen 1.10, OpenAI 1.00).
- Added `getModelByApiId()` with resilient normalization — tries raw, compacted (`gpt-4.1` → `gpt4.1`), and hyphen→dot (`claude-3-7-sonnet` → `claude.3.7.sonnet`) forms so API IDs match registry patterns.

### 3.4 Resilient Selectors
- ChatGPT, Claude, Gemini adapters now cascade `data-testid` / `aria-*` selectors first, then fall back to text-content matching near header/model regions, then a registry-default model name (no more stale hardcoded `'GPT-4o'` / `'Claude 3.5 Sonnet'` defaults — defaults now route through the registry).

---

## 4. Context Bloat & Rot Formula (§4)

### 4.1 New Signals (all in `MetricsCalculator`)
| Signal | Implementation |
|--------|----------------|
| **Cp** — Capacity Pressure | `min(100, totalTokens / contextLimit × 100)` |
| **Ri** — Redundancy Index | Sliding-window 5-word shingles, repeated/total × 200, capped at 100 |
| **Id** — Info Gain Decay | Avg vocabulary-gain of last 4 turns vs first 4 turns → decay % |
| **Td** — Turn Depth Factor | `turnCount / (contextLimit / avgTokensPerTurn) × 100`, default 800 tokens/turn |
| **Dr** — Code Repetition Density | Only duplicated normalized code blocks are penalized |

### 4.2 Composite Scores
```
S_bloat  = min(100, 0.35·Cp + 0.30·Ri + 0.15·Id + 0.10·Td + 0.10·Dr)
S_rot    = min(100, 0.25·Cp + 0.20·Ri + 0.25·Id + 0.20·Td + 0.10·Dr)
S_health = max(S_bloat, S_rot)
```

### 4.3 New Status Tiers (§4.2.4)
| Range | Status | UI Color |
|-------|--------|----------|
| 0–39 | 🟢 Optimal | green |
| 40–64 | 🟡 Dense | yellow |
| 65–84 | 🟠 Degrading | orange (new) |
| 85–100 | 🔴 Bloated | red |

### 4.4 MetricsPayload Shape
- New fields: `healthScore`, `bloatScore`, `rotScore`, `signals.{capacityPressure, redundancyIndex, infoDecay, turnDepth, codeRepetition}`, `contextLimit`.
- `softLimit` kept as a back-compat alias equal to `contextLimit` so existing UI/storage consumers don't break.

---

## 5. UI Changes (§4.3)

### 5.1 Popup
- Ring now shows **Health Score** (max of bloat/rot); label changed from "BLOAT SCORE" to "HEALTH SCORE".
- Added a **Bloat / Rot detail row** (two chips) under the status pill.
- New **Degrading** status pill (orange) + tier-specific descriptions.
- Migrate button thresholds moved to 65 (Degrading) and 85 (Bloated) with orange/red gradients.
- Version tag bumped to `v1.2.0`.

### 5.2 Shadow DOM HUD
- Badge text: `Tokens | Health%`.
- Added `.omni-status-degrading` (orange pulse) alongside optimal/dense/bloated.
- Health bar now uses 4-tier coloring; Bloat/Rot values shown in a dedicated detail row.
- "Prepare Summary" button turns orange (Degrading) or red (Bloated).

### 5.3 Background Badge
- `updateBadge` now uses `healthScore` (fallback `bloatScore`) and 4-tier colors.

---

## 6. Files Changed / Added

**Added**
- `manifest.base.json` — single-source manifest (v1.2.0)
- `scripts/build.js` — per-browser manifest generation + dist copy
- `scripts/bundle-content.js` — zero-dependency content-script bundler
- `src/content/interceptor.js` — main-world fetch/XHR model interceptor
- `tests/metrics.test.js` — 8 smoke/unit tests (registry + metrics)
- `dist/chrome/`, `dist/firefox/` — build outputs (gitignored)

**Modified**
- `package.json` — v1.2.0, `type: module`, build/test scripts, `webextension-polyfill` dep
- `src/core/modelRegistry.js` — Aug 2026 model list, no softLimit, `getModelByApiId()`
- `src/core/metricsCalculator.js` — 5-signal bloat/rot, 4 tiers
- `src/content/adapters/baseAdapter.js` — two-phase `getDetectedModel()`
- `src/content/adapters/{chatgpt,claude,gemini}Adapter.js` — resilient selectors + text matching
- `src/content/adapters/{deepseek,kimi,qwen,generic}Adapter.js` — constructor alignment
- `src/content/content.js` — interceptor listener/injection, polyfill-safe storage
- `src/content/ui/shadowContainer.js` — 4-tier HUD, health/bloat/rot, import-path fix
- `src/background/serviceWorker.js` — polyfill, 4-tier badge
- `src/popup/{popup.js,popup.html,popup.css}` — polyfill, health ring, bloat/rot chips, degrading tier
- `src/content/content.bundle.js` — regenerated

---

## 7. Verification Performed

### Automated (passing)
```
$ npm test
# pass 8 / fail 0
```
- ModelRegistry `getModelByApiId` resolves 19 real API IDs (GPT-4.1, o3, o4-mini, Claude 3.5/3.7/4, Gemini 2.5, DeepSeek, Kimi, Qwen).
- Short concise conversation → Optimal (<40).
- Repetitive long conversation → Ri > 0, bloat ≥ 40.
- Repeated code blocks → Dr > 0; unique code → Dr = 0.
- Status thresholds exact at 39/40/64/65/84/85.
- `healthScore === max(bloat, rot)`; empty input → zeroed/Optimal.

### Build
- `npm run build` produces valid `dist/chrome/manifest.json` (service_worker, no gecko) and `dist/firefox/manifest.json` (scripts + gecko).
- `node --check` passes on `content.bundle.js` (60 KB) and `serviceWorker.js`.

---

## 8. Remaining Manual QA (from SPEC-1 §6)

- Load unpacked `dist/chrome/` in Chrome/Edge/Brave and `dist/firefox/` in Firefox — verify no console errors.
- Visit each LLM platform; confirm model name detected (network path first, DOM fallback).
- 20+ turn conversations: short/concise → <30; repetitive → 50–70; restating → 85+.
- Switch models mid-conversation → model name updates.
- Firefox-specific: verify dynamic interceptor injection (no `"world": "MAIN"`).

---

## 9. Open Questions (deferred from SPEC-1 §7)

- **Q1 Safari:** deferred to v1.2 (Xcode packaging constraints).
- **Q2 CSP restrictions:** platforms with strict CSP may block main-world injection; DOM-only fallback is already in place.
- **Q3 Claude multiplier (1.15 vs 1.18):** kept 1.15 per spec; needs empirical validation.
- **Q4 Degrading-tier UX:** implemented as visual tier + orange migrate button; no proactive popup/warning added (can be a v1.2 enhancement).
