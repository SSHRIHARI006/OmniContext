# SPEC-3: OmniContext v1.1 — Post-Implementation Review & v1.2 Roadmap

**Spec Version:** 3.0.0  
**Date:** 2026-08-04  
**Status:** Review  
**Relates To:** [SPEC-1](./spec1.md) (design) → [SPEC-2](./spec2.md) (implementation log)

---

## 1. Review Summary

Full code audit of every file touched by SPEC-1/SPEC-2. The implementation is solid —
the 5-signal bloat/rot formula, network interceptor, and build pipeline all work as
spec'd. Below are the issues, improvements, and future features I found.

| Category | Count |
|----------|-------|
| 🔴 Bugs / Correctness Issues | 4 |
| 🟡 Improvements / Hardening | 7 |
| 🟢 Stale Docs & Housekeeping | 4 |
| 🔵 v1.2 Feature Roadmap | 6 |

---

## 2. 🔴 Bugs & Correctness Issues

### BUG-1: DeepSeek adapter uses invalid CSS class selector

**File:** `src/content/adapters/deepseekAdapter.js:40-41`

```javascript
if (el.classList.contains('._user-message') || el.closest('._user-message')) {
```

`classList.contains('._user-message')` will never match because `classList.contains`
expects the class name WITHOUT the `.` prefix. The selector `'._user-message'` is also
wrong — `_user-message` begins with an underscore, not a dot.

**Fix:**
```javascript
if (el.classList.contains('_user-message') || el.closest('._user-message')) {
```

### BUG-2: DeepSeek `extractModelName()` fallback is still hardcoded

**File:** `src/content/adapters/deepseekAdapter.js:31`

```javascript
return 'DeepSeek-V3';
```

Every other adapter was updated to return a registry-routed default (e.g., `'DeepSeek (default)'`
or route through the registry). DeepSeek still returns a hardcoded specific model name
which will claim the wrong context limit if the user is actually on DeepSeek-R1.

**Fix:** Change to `return 'DeepSeek (default)';` to match the registry entry.

### BUG-3: Firefox interceptor injection uses `chrome.runtime.getURL` not `extApi`

**File:** `src/content/content.js:141`

```javascript
script.src = chrome.runtime.getURL('src/content/interceptor.js');
```

On Firefox, `chrome` may not exist or may behave differently. The content script
defines `extApi` at the top of the file for this exact reason, but then doesn't
use it here.

**Fix:**
```javascript
script.src = (extApi || chrome).runtime.getURL('src/content/interceptor.js');
```

Or better, since Firefox natively exposes `browser`:
```javascript
const api = typeof browser !== 'undefined' ? browser : chrome;
script.src = api.runtime.getURL('src/content/interceptor.js');
```

### BUG-4: `manifest.base.json` missing `content_scripts` block

**File:** `manifest.base.json`

The base manifest has no `content_scripts` array — the build script
(`scripts/build.js`) needs to inject it. Verify that `build.js` actually adds both
the MAIN-world interceptor entry (for Chrome) and the isolated-world content bundle.
If not, the extension loads with **no content scripts** at all.

**Action:** Verify `scripts/build.js` output. If the content_scripts block isn't being
injected, add it to `manifest.base.json`:

```json
"content_scripts": [
  {
    "matches": ["*://*.chatgpt.com/*", "*://*.openai.com/*", "*://*.claude.ai/*",
                "*://*.gemini.google.com/*", "*://*.deepseek.com/*", "*://*.moonshot.cn/*",
                "*://*.kimi.com/*", "*://*.aliyun.com/*", "*://*.qwenlm.ai/*"],
    "js": ["src/content/content.bundle.js"],
    "run_at": "document_end"
  }
]
```

---

## 3. 🟡 Improvements & Hardening

### IMP-1: Redundancy Index memory pressure on very long conversations

**File:** `src/core/metricsCalculator.js:134-156`

`calculateRedundancy()` builds a `Set` of ALL 5-word shingles across the entire
conversation. A 100k-word conversation produces ~100k shingles, each ~30-50 chars.
That's ~5MB in a Set on every 500ms debounced scan.

**Recommendation:** Cap the shingle set at 50,000 entries and stop accumulating once
hit. Or use a sampling strategy — only analyze every Nth message when the conversation
exceeds 20 messages.

```javascript
const MAX_SHINGLES = 50000;
// ...
if (allShingles.size < MAX_SHINGLES) {
  allShingles.add(shingle);
}
```

### IMP-2: Info Gain Decay comparing first 4 vs last 4 is fragile

**File:** `src/core/metricsCalculator.js:164-190`

When a conversation has exactly 4 messages, `first4` and `last4` are the SAME array.
The decay will always be 0 for conversations of length 4. Consider requiring
`messages.length < 6` (not 4) before returning 0, so there's at least some separation
between the "early" and "late" windows.

Also, the first message always has ~100% info gain (all words are new), which skews
`earlyAvg` very high. Consider dropping the first message from the early window.

### IMP-3: Network interceptor should throttle `postMessage`

**File:** `src/content/interceptor.js`

Streaming responses from ChatGPT/Claude can trigger dozens of fetch calls per second
during response generation. Each one fires `sendDetection()` → `postMessage()` →
content script re-scans. This defeats the 500ms debounce in the MutationObserver path
because the interceptor listener calls `performScan()` directly.

**Fix:** Add a debounce/dedup to the interceptor listener in `content.js`:

```javascript
setupInterceptorListeners() {
  let lastModelId = null;
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || data.type !== 'OMNI_MODEL_DETECTED' || !data.modelId) return;
    if (data.modelId === lastModelId) return;  // deduplicate
    lastModelId = data.modelId;
    if (this.adapter) {
      this.adapter.setInterceptedModel(data.modelId);
      this.performScan();
    }
  });
}
```

### IMP-4: `dist/` not in `.gitignore`

**File:** `.gitignore`

The `dist/` directory is generated by the build pipeline but not gitignored. It should
not be tracked.

**Fix:** Add `dist/` to `.gitignore`.

### IMP-5: Popup simulation dropdown is stale

**File:** `src/popup/popup.html:137-142`

The simulation dropdown still shows old model names:
- `"Claude 3.5 (200k limit)"` — should be `"Claude 4 (200k limit)"`
- `"Gemini 1.5 (1M limit)"` — should be `"Gemini 2.5 (1M limit)"`
- `"DeepSeek (64k limit)"` — DeepSeek's limit is now 128k in the registry

### IMP-6: `kimi.com` added to host_permissions but not Kimi adapter `matches()`

**File:** `manifest.base.json:18` vs `src/content/adapters/kimiAdapter.js:19`

The manifest adds `*://*.kimi.com/*` as a host permission, but the Kimi adapter's
`matches()` only checks for `moonshot.cn|kimi.ai`, not `kimi.com`.

**Fix:** Update Kimi adapter:
```javascript
matches(hostname) {
  return /moonshot\.cn|kimi\.ai|kimi\.com/.test(hostname);
}
```

### IMP-7: `SPEC.md` at repo root is stale v1.0 spec

**File:** `SPEC.md`

The root `SPEC.md` still documents the v1.0 formula (3-signal, `softLimit` based, 3
tiers). It contradicts the actual v1.1 implementation. Either:
- Delete it and point to `.specs/` as the canonical spec directory, or
- Overwrite it with a redirect note

---

## 4. 🟢 Stale Docs & Housekeeping

### DOC-1: README.md is v1.0

**File:** `README.md:1`

Still says `V1.0.0` in the title and describes the old architecture (no mention of
network interceptor, 5-signal bloat/rot, 4 tiers, or build pipeline).

**Updates needed:**
- Version to `V1.1.0`
- Add network interceptor to architecture diagram
- Update "Metrics & Bloat Calculator" description to mention Health/Bloat/Rot
- Add build commands (`npm run build`, `npm run build:chrome`, `npm run build:firefox`)
- Update model list (GPT-4.1, o3, Claude 4, Gemini 2.5, etc.)
- Add note about loading from `dist/chrome/` or `dist/firefox/` instead of root

### DOC-2: Old `manifest.json` still exists alongside `manifest.base.json`

**File:** `manifest.json`

The original v1.0 `manifest.json` is still in the repo root. This causes confusion —
if someone loads the extension from root (as the README instructs), they'll get the
old v1.0 manifest with `softLimitTokens: 24000`, the wrong background config, etc.

**Action:** Either delete `manifest.json` or make it a symlink/copy from the Chrome
build output. The README should instruct loading from `dist/chrome/` after running
`npm run build`.

### DOC-3: Old zip artifact `omnicontext-v1.0.0.zip` still in repo

**File:** `omnicontext-v1.0.0.zip`

Stale release artifact. Should be gitignored (already covered by `*.zip`) but is
already tracked. Remove from tracking:
```bash
git rm --cached omnicontext-v1.0.0.zip
```

### DOC-4: `package.json` scripts reference version in filenames

**File:** `package.json:12`

The package script hardcodes `omnicontext-v1.1.0-chrome.zip`. This will need manual
updates every version bump.

**Improvement:** Use `$npm_package_version` in the script:
```json
"package": "npm run build && cd dist/chrome && zip -r ../../omnicontext-v${npm_package_version}-chrome.zip . && cd ../firefox && zip -r ../../omnicontext-v${npm_package_version}-firefox.zip ."
```

---

## 5. 🔵 v1.2 Feature Roadmap

### FEAT-1: Signal Breakdown Panel in Popup

Currently the popup shows the composite Health/Bloat/Rot scores but NOT the individual
5 signals (Cp, Ri, Id, Td, Dr). These are computed and returned in `metrics.signals`
but never rendered.

**Proposal:** Add a collapsible "Signal Breakdown" section to the popup showing all 5
signal values as horizontal bar charts. This gives the user actionable insight into
*why* their score is high (is it redundancy? capacity? info decay?).

```
┌────────────────────────────────┐
│ 📊 Signal Breakdown      [▾]  │
│ Capacity Pressure  ████░░  35 │
│ Redundancy Index   ██████░ 62 │
│ Info Gain Decay    ███░░░░ 28 │
│ Turn Depth         █░░░░░░ 12 │
│ Code Repetition    ░░░░░░░  0 │
└────────────────────────────────┘
```

### FEAT-2: Per-Signal Tooltips & Actionable Advice

When a signal is elevated, show contextual advice:
- **Ri > 50:** "Your conversation has high repetition. Try summarizing previous context."
- **Id > 60:** "Recent messages aren't adding new information. Consider starting fresh."
- **Dr > 40:** "Multiple identical code blocks detected. Reference code by name instead of repeating."

### FEAT-3: Conversation History / Session Tracking

Currently metrics are only for the active tab/moment. Add:
- Store snapshots of metrics over time (every 5 minutes or on every scan)
- Show a sparkline/mini-chart of health score over the conversation lifetime
- Detect the *rate* of degradation, not just current state

This requires a small IndexedDB or `storage.local` schema:
```javascript
{
  sessionId: "uuid",
  platform: "chatgpt",
  model: "GPT-4.1",
  snapshots: [
    { timestamp: 1722787200000, health: 12, bloat: 10, rot: 12, tokens: 3400 },
    { timestamp: 1722787500000, health: 25, bloat: 22, rot: 25, tokens: 8200 },
    // ...
  ]
}
```

### FEAT-4: Configurable Thresholds & Notification

Let users customize:
- Health score threshold for the "Degrading" warning (default 65)
- Health score threshold for the "Bloated" alert (default 85)
- Enable/disable browser notifications when threshold is crossed
- Auto-trigger migration prompt at a custom threshold

Add a "Settings" tab/section to the popup or a dedicated options page.

### FEAT-5: Export Conversation Analytics

Add an "Export" button in the popup that downloads a JSON/CSV report:
```json
{
  "platform": "claude",
  "model": "Claude Opus 4",
  "totalTokens": 45200,
  "healthScore": 58,
  "bloatScore": 52,
  "rotScore": 58,
  "signals": { "Cp": 23, "Ri": 45, "Id": 38, "Td": 12, "Dr": 0 },
  "turnCount": 18,
  "timestamp": "2026-08-04T13:00:00Z"
}
```

Useful for users who want to track their usage patterns across sessions.

### FEAT-6: Enhanced Migration Prompt — Context-Aware Summary

The current migration prompt is a static string. Improve it to be context-aware:
- Include the detected model name and platform
- Include current token count and health score
- If Ri is high, specifically ask the model to deduplicate
- If Id is high, ask the model to focus on only the most recent decisions

```javascript
static generateContextAwarePrompt(metrics, modelName) {
  let prompt = `We are at ${metrics.capacityUsed}% context capacity on ${modelName}. `;
  prompt += `Health Score: ${metrics.healthScore}/100. `;
  
  if (metrics.signals.redundancyIndex > 40) {
    prompt += 'There is significant content repetition — please deduplicate. ';
  }
  if (metrics.signals.infoDecay > 50) {
    prompt += 'Recent turns have low information gain — focus on only the latest decisions. ';
  }
  
  prompt += 'Please generate a structured Markdown summary of our discussion...';
  return prompt;
}
```

---

## 6. Priority Matrix

| ID | Category | Effort | Impact | Priority |
|----|----------|--------|--------|----------|
| BUG-1 | DeepSeek class selector | 5 min | Medium | **P0** |
| BUG-2 | DeepSeek hardcoded fallback | 5 min | Low | **P0** |
| BUG-3 | Firefox `chrome.runtime` | 5 min | High | **P0** |
| BUG-4 | Missing content_scripts in manifest | 15 min | Critical | **P0** |
| IMP-3 | Interceptor dedup/throttle | 15 min | Medium | **P1** |
| IMP-4 | `dist/` in gitignore | 1 min | Low | **P1** |
| IMP-5 | Popup simulation labels | 5 min | Low | **P1** |
| IMP-6 | Kimi `kimi.com` domain | 2 min | Low | **P1** |
| IMP-7 | Stale root SPEC.md | 10 min | Low | **P2** |
| DOC-1 | README update | 30 min | Medium | **P2** |
| DOC-2 | Remove old manifest.json | 5 min | Medium | **P1** |
| DOC-3 | Remove old zip | 2 min | Low | **P2** |
| DOC-4 | Dynamic version in scripts | 5 min | Low | **P3** |
| IMP-1 | Shingle set memory cap | 20 min | Medium | **P2** |
| IMP-2 | Info decay window tuning | 15 min | Low | **P2** |
| FEAT-1 | Signal breakdown panel | 2 hr | High | **v1.2** |
| FEAT-2 | Per-signal tooltips | 1 hr | Medium | **v1.2** |
| FEAT-3 | Session history tracking | 4 hr | High | **v1.2** |
| FEAT-4 | Configurable thresholds | 3 hr | Medium | **v1.2** |
| FEAT-5 | Export analytics | 1 hr | Low | **v1.2** |
| FEAT-6 | Context-aware migration | 1 hr | High | **v1.2** |

---

## 7. Conclusion

The v1.1 implementation is functionally complete and well-structured. The **4 P0 bugs**
should be fixed before any release or further QA — particularly BUG-3 (Firefox
interceptor) and BUG-4 (manifest content_scripts). The **P1 improvements** are quick
wins that harden the extension for production. The **v1.2 features** (signal breakdown,
session history, context-aware migration) would meaningfully differentiate OmniContext
from basic token counters.
