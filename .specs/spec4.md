# SPEC-4: OmniContext v1.1 — SPEC-3 Review Fixes (Bugs, Hardening, Housekeeping)

**Spec Version:** 4.0.0
**Date:** 2026-08-04
**Status:** Implemented — Ready for Commit
**Relates To:** [SPEC-1](./spec1.md) (design) → [SPEC-2](./spec2.md) (implementation log) → [SPEC-3](./spec3.md) (review & roadmap)

---

## 1. What This Spec Covers

SPEC-3 audited the SPEC-1/SPEC-2 implementation and found 4 P0 bugs, 7 improvements,
4 stale-doc items, and a 6-item v1.2 roadmap. This spec implements **all bugs (P0)**,
**all improvements (P1–P3)**, and **all housekeeping/docs items**. The v1.2 feature
roadmap (FEAT-1 … FEAT-6) is intentionally **deferred** per SPEC-3 §6 priority matrix.

| Category | Planned | Status |
|----------|---------|--------|
| 🔴 Bugs / Correctness | 4 (BUG-1 … BUG-4) | ✅ All fixed |
| 🟡 Improvements / Hardening | 7 (IMP-1 … IMP-7) | ✅ All applied |
| 🟢 Stale Docs & Housekeeping | 4 (DOC-1 … DOC-4) | ✅ All done |
| 🔵 v1.2 Feature Roadmap | 6 (FEAT-1 … FEAT-6) | ⏸ Deferred to v1.2 |

---

## 2. 🔴 Bugs Fixed

### BUG-1 — DeepSeek invalid CSS class selector ✅
`src/content/adapters/deepseekAdapter.js`
```javascript
// before: el.classList.contains('._user-message')   // never matches (dot prefix)
// after:  el.classList.contains('_user-message')    // correct, no dot
```

### BUG-2 — DeepSeek hardcoded fallback ✅
`src/content/adapters/deepseekAdapter.js` — `return 'DeepSeek-V3'` → `return 'DeepSeek (default)'` to route through the registry and avoid claiming the wrong context limit.

### BUG-3 — Firefox interceptor used `chrome.runtime` ✅
`src/content/content.js` — `chrome.runtime.getURL(...)` → `(extApi || chrome).runtime.getURL(...)` so Firefox (which exposes `browser` as `extApi`) works.

### BUG-4 — Missing `content_scripts` in manifest (Critical) ✅
`manifest.base.json` had **no `content_scripts` block** — the built extension loaded with zero content scripts and did nothing. Fixed in two places:
- `manifest.base.json`: added the isolated-world content bundle entry (`run_at: document_end`).
- `scripts/build.js`: Chrome builds now append a second entry with `"world": "MAIN"` running `src/content/interceptor.js` at `document_start`. Firefox gets only the isolated-world entry (dynamic interceptor injection).

**Verified in `dist/`:**
- Chrome: 2 content_scripts — bundle (isolated) + interceptor (MAIN world) ✅
- Firefox: 1 content_script — bundle only, no `world: "MAIN"` ✅

---

## 3. 🟡 Improvements Applied

### IMP-1 — Redundancy shingle-set memory cap ✅
`src/core/metricsCalculator.js` — `calculateRedundancy()` now stops adding to the shingle `Set` once it reaches `MAX_SHINGLES = 50000`, preventing a ~5MB Set on long conversations during every 500ms scan. Repeated shingles are still counted.

### IMP-2 — Info Gain Decay window tuning ✅
`src/core/metricsCalculator.js` — `calculateInfoDecay()` now:
- Requires `messages.length >= 6` (previously 4), so the early/late windows are distinct.
- Drops the first message from the early baseline (`slice(1, 5)`), whose vocab is ~100% new by definition and skewed `earlyAvg` upward.

### IMP-3 — Interceptor dedup/throttle ✅
`src/content/content.js` — the interceptor message listener now ignores repeat `modelId` values (`lastModelId` guard), so streaming response bursts no longer trigger a `performScan()` per fetch.

### IMP-4 — `dist/` gitignored ✅
`.gitignore` — added `dist/` under a new "Build outputs" section.

### IMP-5 — Popup simulation labels updated ✅
`src/popup/popup.html` — `Claude 3.5` → `Claude 4`, `Gemini 1.5` → `Gemini 2.5`, `DeepSeek (64k)` → `DeepSeek (128k)`.

### IMP-6 — Kimi `kimi.com` domain ✅
`src/content/adapters/kimiAdapter.js` — `matches()` now also accepts `kimi.com`:
```javascript
return /moonshot\.cn|kimi\.ai|kimi\.com/.test(hostname);
```
(Confirmed present in the regenerated `content.bundle.js`.)

### IMP-7 — Stale root `SPEC.md` ✅
Deleted `SPEC.md` from the repo. `.specs/` is now the canonical spec directory (SPEC-1 → SPEC-4).

---

## 4. 🟢 Docs & Housekeeping Done

### DOC-1 — README rewritten for v1.1 ✅
`README.md` — title bumped to V1.2.0; architecture diagram now shows the network interceptor, 5-signal Health/Bloat/Rot calculator, and 4 status tiers; added build commands (`npm run build`, `build:chrome`, `build:firefox`, `test`, `package`); loading instructions now point at `dist/chrome/` and `dist/firefox/`; model list updated (GPT-4.1, o3, Claude 4, Gemini 2.5, etc.).

### DOC-2 — Old root `manifest.json` removed ✅
Deleted the stale v1.0 manifest; loading is now only from `dist/` (generated from `manifest.base.json`).

### DOC-3 — Old zip artifact removed ✅
Deleted `omnicontext-v1.0.0.zip` from disk and git tracking (`*.zip` already in `.gitignore`).

### DOC-4 — Dynamic version in package script ✅
`package.json` — `omnicontext-v1.2.0-chrome.zip` → `omnicontext-v${npm_package_version}-chrome.zip` (same for firefox), so version bumps no longer need manual script edits.

---

## 5. Verification

### Tests (10/10 passing)
```
$ npm test
# pass 10 / fail 0
```
- Existing 8 tests (registry resolution, bloat/rot signals, tier thresholds, health=max).
- **New:** `calculateInfoDecay()` returns 0 for 5-message conversations (IMP-2).
- **New:** `calculateRedundancy()` unchanged behavior under the 50k cap for unique content (IMP-1).

### Build
- `npm run build` regenerates `content.bundle.js` and both `dist/chrome/` + `dist/firefox/`.
- Verified Chrome manifest has 2 content_scripts (bundle + MAIN-world interceptor) and Firefox has 1 (bundle only).
- All fixes confirmed present in the regenerated bundle.

---

## 6. Deferred to v1.2 (from SPEC-3 §5)

- **FEAT-1:** Signal Breakdown panel in popup (Cp/Ri/Id/Td/Dr bars)
- **FEAT-2:** Per-signal tooltips & actionable advice
- **FEAT-3:** Conversation history / session tracking (sparkline, degradation rate)
- **FEAT-4:** Configurable thresholds & notifications
- **FEAT-5:** Export conversation analytics (JSON/CSV)
- **FEAT-6:** Context-aware migration prompt (dynamic, signal-aware)

---

## 7. Files Changed

**Deleted**
- `SPEC.md` (stale v1.0 spec)
- `manifest.json` (stale v1.0 manifest)
- `omnicontext-v1.0.0.zip` (stale artifact)

**Modified**
- `.gitignore` — added `dist/`
- `README.md` — v1.1 rewrite
- `package.json` — dynamic version in `package` script
- `manifest.base.json` — added `content_scripts` block
- `scripts/build.js` — Chrome MAIN-world interceptor injection
- `src/content/content.js` — `extApi` interceptor injection (BUG-3), interceptor dedup (IMP-3)
- `src/content/adapters/deepseekAdapter.js` — BUG-1, BUG-2
- `src/content/adapters/kimiAdapter.js` — IMP-6
- `src/core/metricsCalculator.js` — IMP-1, IMP-2
- `src/popup/popup.html` — IMP-5
- `src/content/content.bundle.js` — regenerated
- `tests/metrics.test.js` — +2 tests
- `dist/chrome/`, `dist/firefox/` — rebuilt (gitignored)

**Untracked (new since v1.1)**
- `.specs/spec1.md`, `spec2.md`, `spec3.md`, `spec4.md`
- `manifest.base.json`, `scripts/`, `src/content/interceptor.js`, `tests/`, `package-lock.json`
