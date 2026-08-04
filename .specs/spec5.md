# SPEC-5: OmniContext v1.1 — Critical Audit: Why Nothing Works

**Spec Version:** 5.0.0  
**Date:** 2026-08-04  
**Status:** Audit — Requires Immediate Fixes  
**Relates To:** [SPEC-4](./spec4.md) (last implementation) → this audit

---

## 1. Symptoms Reported

| # | Issue | Severity |
|---|-------|----------|
| 1 | **No calculations at all** — badge shows 0, HUD shows 0, popup shows 0 or simulation | 🔴 Critical |
| 2 | **Overlay is stuck** — cannot drag, click, or interact with the HUD badge/card | 🔴 Critical |
| 3 | **No tracking** — metrics never sync to background, popup can't fetch live data | 🔴 Critical |

---

## 2. Root Cause Analysis

After auditing every file in the repo, here are **all the issues** found, in order of
severity. The three user-reported symptoms trace to a cascade of related failures:

---

### 🔴 CRITICAL-1: Service Worker and Popup CRASH on load — bare `import` of npm module

**Files:** `src/background/serviceWorker.js:7`, `src/popup/popup.js:7`

```javascript
import browser from 'webextension-polyfill';
```

**Why it's broken:** Browser extensions DO NOT have a Node.js module resolver. The
browser's JS engine cannot resolve bare specifiers like `'webextension-polyfill'` —
it needs a relative path to an actual `.js` file. This `import` statement causes an
**immediate parse error** that kills the service worker and popup entirely.

**Impact:** This is the root cause of ALL THREE user symptoms:
- **No tracking:** The service worker crashes on startup → never registers its
  `onMessage` listener → never updates the badge → never saves metrics to storage.
- **Popup blank/simulation only:** The popup JS crashes on line 7 → `PopupController`
  never instantiates → `fetchMetricsFromActiveTab()` never runs → the popup can only
  show the hardcoded simulation fallback (if it even renders).
- **No calculations forwarded:** Without the service worker, the
  `syncStateToBackground()` call in the content script silently fails because there's
  no message listener on the other end.

**The content bundle IS fine** — it was correctly bundled into an IIFE by the custom
bundler and does NOT import `webextension-polyfill`. That's why the HUD widget
appears at all (the content script runs, but its data never reaches the popup or
background).

**Fix:** The polyfill must be either:
1. **Vendored** — copy `node_modules/webextension-polyfill/dist/browser-polyfill.js`
   into the extension tree and reference it with a relative `import`.
2. **Bundled** — pre-bundle popup.js and serviceWorker.js the same way content.bundle.js
   is bundled (resolve imports at build time).
3. **Eliminated** — replace the polyfill import with the same `extApi` pattern used in
   the content script: `const browser = globalThis.browser || globalThis.chrome;`

Option 3 is the fastest and most reliable. The polyfill was added to unify
promise-based APIs, but Chrome 120+ already returns promises from `chrome.storage.*`
and `chrome.tabs.*`, and Firefox natively has `browser.*`. The polyfill adds no value
for MV3 targets.

---

### 🔴 CRITICAL-2: Service Worker manifest missing `"type": "module"`

**File:** `dist/chrome/manifest.json:81-83`

```json
"background": {
  "service_worker": "src/background/serviceWorker.js"
}
```

Even after fixing the import, `serviceWorker.js` uses ES `import` syntax. Chrome
requires `"type": "module"` in the background config to parse ES modules:

```json
"background": {
  "service_worker": "src/background/serviceWorker.js",
  "type": "module"
}
```

Without this, Chrome rejects the service worker with a syntax error on the `import`
statement, which is ALSO a crash → no badge, no message handling, no storage sync.

**Fix:** Add `"type": "module"` to the background block in `scripts/build.js` for the
Chrome target. For Firefox (which uses `background.scripts`), this isn't needed because
Firefox handles modules differently — but the import still needs to resolve to a real
file.

---

### 🔴 CRITICAL-3: Popup script uses `type="module"` but imports are unresolvable

**File:** `src/popup/popup.html:158`

```html
<script type="module" src="popup.js"></script>
```

`popup.js` imports:
```javascript
import browser from 'webextension-polyfill';        // ← bare specifier, CRASHES
import { MetricsCalculator } from '../core/metricsCalculator.js';  // ← works
import { MigrationPromptEngine } from '../core/migrationPrompt.js'; // ← works
import { ModelRegistry } from '../core/modelRegistry.js';           // ← works
```

The relative imports (`../core/...`) would actually work because the popup runs from
`src/popup/popup.html` and the relative paths resolve correctly within the extension.
But the FIRST import (`webextension-polyfill`) crashes the entire module graph before
any of the others execute.

**Fix:** Same as CRITICAL-1 — remove the bare polyfill import.

---

### 🟠 HIGH-1: HUD dragging broken — Shadow DOM event boundary

**File:** `src/content/ui/shadowContainer.js` (in bundle, lines 1493–1534)

The `setupDragging()` method attaches `mousedown` to the badge and card header
(which are inside the Shadow DOM), but attaches `mousemove` and `mouseup` to
`window`. The problem: in many browsers, `mousemove` events that START inside a
Shadow DOM element do NOT propagate to `window` event listeners correctly when the
mouse moves OUTSIDE the shadow host. This causes the dragging to "stick" or not
work at all.

Additionally, the `e.preventDefault()` on `mousedown` prevents text selection but
ALSO prevents the browser from establishing a proper pointer capture, which means:
- On some platforms, the cursor doesn't change to "grabbing"
- The badge may not respond to clicks at all if `wasDragging` gets stuck as `true`

**Fix:**
```javascript
// Use document-level listeners instead of window for Shadow DOM compatibility
const doc = this.host.ownerDocument || document;

// On mousedown, capture the pointer for reliable tracking
badge.addEventListener('mousedown', (e) => {
  // ... existing logic ...
  badge.setPointerCapture(e.pointerId);  // ensures events track even outside shadow
});

doc.addEventListener('mousemove', moveHandler);
doc.addEventListener('mouseup', upHandler);
```

Or more robustly, switch to `pointermove`/`pointerup` with `setPointerCapture()`.

---

### 🟠 HIGH-2: Content script calculations run but results never reach UI correctly

**File:** `src/content/content.js` (bundle lines 1666–1686)

The `performScan()` method DOES run — it extracts messages, calculates metrics, and
calls `this.shadowUI.updateMetrics(...)`. So the HUD SHOULD show data.

However, the issue is timing and adapter selector matching:

1. **ChatGPT's DOM has changed significantly.** The selectors
   `[data-message-author-role]` and `article` may not match current ChatGPT DOM.
   If `extractMessages()` returns `[]`, all metrics are zero.

2. **Claude's selectors are stale.** `.font-claude-message` and `.user-message-block`
   were valid in 2025 but Claude's React app now uses different class names. The
   `data-testid` selectors MAY still work if Anthropic hasn't removed them.

3. **Gemini's `message-content` is a custom element** — `document.querySelectorAll('message-content')`
   works only if the custom element is defined. If Gemini changed its component
   architecture, this returns nothing.

**Impact:** `extractMessages()` returns `[]` → all 5 signals (Cp, Ri, Id, Td, Dr)
evaluate to 0 → `healthScore = 0` → the HUD shows "0 Tokens | 0% Health" which
looks like "nothing works."

**Fix:** Each adapter needs updated selectors verified against the current DOM of each
platform. This requires live testing on each site. For now, add more resilient
fallback selectors and verbose debug logging so the user can see if messages are being
found.

---

### 🟡 MEDIUM-1: `manifest.base.json` has no `background` block

**File:** `manifest.base.json`

The base manifest is missing the `background` property entirely. The build script
(`scripts/build.js:29-53`) adds it per-browser, which is correct. But if someone
loads `manifest.base.json` directly (which is the file at the repo root), there's
no service worker and no background script at all.

**Impact:** If the user loaded the extension from the repo root instead of from
`dist/chrome/`, the extension has NO service worker. Combined with CRITICAL-1, this
means zero background functionality.

**Fix:** The README instructs loading from `dist/`, which is correct. But add a
safety check: if no `manifest.json` exists at root, users can't accidentally load
the wrong thing. (The old `manifest.json` was deleted in SPEC-4, which is good.)

---

### 🟡 MEDIUM-2: `popup.js` uses `type="module"` which Chrome extensions handle differently

**File:** `src/popup/popup.html:158`

Chrome extension popups handle `<script type="module">` but with quirks:
- Module scripts are deferred by default
- Relative imports must match the extension's internal URL scheme
- If ANY import in the module graph fails, the ENTIRE graph is abandoned (no partial
  execution)

Since `popup.js` imports from `../core/*.js`, and these files themselves import from
`./tokenEngine.js`, the entire module chain must be resolvable. Currently, `tokenEngine.js`
has no imports of its own, so this chain WOULD work — except the `webextension-polyfill`
import at the top kills everything.

**Fix:** After removing the polyfill import (CRITICAL-1/CRITICAL-3), verify that all
relative imports in the popup module chain resolve correctly by checking Chrome's
DevTools console when the popup opens.

---

### 🟡 MEDIUM-3: Popup falls through to simulation mode silently

**File:** `src/popup/popup.js:115-126`

```javascript
async fetchFromStorage() {
  try {
    const result = await browser.storage.local.get('activeMetrics');
    // ...
  } catch (e) {
    this.runSimulation('gemini');  // ← silent fallback
  }
}
```

When the service worker is dead (CRITICAL-1), `activeMetrics` is never stored.
The popup tries `sendMessage()` → fails → tries `storage.local.get` → gets `null` →
falls through to `runSimulation('gemini')`. The user sees simulated data thinking it's
real, or sees 0s if the simulation also fails.

**Fix:** Add a visible indicator when running in simulation/fallback mode:
```javascript
if (!response?.metrics) {
  this.showToast('⚠️ No live data — showing simulation');
  this.runSimulation(platformKey);
}
```

---

### 🟡 MEDIUM-4: Build script doesn't copy `node_modules/` to dist

**File:** `scripts/build.js:65`

```javascript
cpSync(SRC, join(outDir, 'src'), { recursive: true });
```

Only `src/` is copied to `dist/`. If the polyfill were to be kept, `node_modules/
webextension-polyfill/` would need to be copied too (or vendored into `src/lib/`).
Currently, `dist/chrome/node_modules/` does not exist, so even if the import syntax
were fixed, the file wouldn't be found.

**Fix:** If keeping the polyfill, vendor it. Otherwise (recommended), remove it
entirely per CRITICAL-1.

---

## 3. Cascade Diagram

```
CRITICAL-1: bare import 'webextension-polyfill' in popup.js + serviceWorker.js
  │
  ├──► Service Worker CRASHES on parse
  │     ├──► No onMessage listener → metrics never saved to storage
  │     ├──► No badge updates → badge stays at "OMNI" forever
  │     └──► Content script's syncStateToBackground() silently fails
  │
  ├──► Popup.js CRASHES on parse
  │     ├──► PopupController never instantiates
  │     ├──► fetchMetricsFromActiveTab() never runs
  │     └──► User sees either blank popup or HTML skeleton with 0s
  │
  └──► Content bundle runs fine (IIFE, no bare imports)
        ├──► HUD widget renders ✅
        ├──► performScan() runs ✅ ...but:
        │     └──► extractMessages() returns [] because selectors are stale
        │           └──► All metrics = 0 → "no calculations"
        └──► Dragging fails due to Shadow DOM event boundary issues
              └──► "overlay is stuck"
```

---

## 4. Fix Plan (Priority Order)

### P0 — Must fix (extension is non-functional without these)

| ID | Fix | Files | Effort |
|----|-----|-------|--------|
| FIX-1 | Remove `webextension-polyfill` import from popup and service worker. Replace with `const browser = globalThis.browser \|\| globalThis.chrome;` | `src/popup/popup.js`, `src/background/serviceWorker.js`, `package.json` | 15 min |
| FIX-2 | Add `"type": "module"` to Chrome background config in build script | `scripts/build.js` | 5 min |
| FIX-3 | Re-bundle `content.bundle.js` and rebuild dist | run `npm run build` | 2 min |

### P1 — High priority (functional but broken UX)

| ID | Fix | Files | Effort |
|----|-----|-------|--------|
| FIX-4 | Fix HUD dragging: switch to `pointerdown/pointermove/pointerup` with `setPointerCapture()` for reliable Shadow DOM drag | `src/content/ui/shadowContainer.js` | 30 min |
| FIX-5 | Update ChatGPT adapter selectors for current DOM (Aug 2026) | `src/content/adapters/chatgptAdapter.js` | 30 min |
| FIX-6 | Update Claude adapter selectors for current DOM | `src/content/adapters/claudeAdapter.js` | 30 min |
| FIX-7 | Update Gemini adapter selectors for current DOM | `src/content/adapters/geminiAdapter.js` | 30 min |

### P2 — Improvements

| ID | Fix | Files | Effort |
|----|-----|-------|--------|
| FIX-8 | Add visual "simulation mode" indicator in popup when no live data | `src/popup/popup.js` | 10 min |
| FIX-9 | Add debug logging toggle so users can diagnose selector mismatches | `src/content/content.js` | 15 min |
| FIX-10 | Vendor or remove `webextension-polyfill` from `package.json` dependencies | `package.json` | 5 min |

---

## 5. Adapter Selector Verification Needed

Each adapter's `extractMessages()` and `extractModelName()` must be verified against
the LIVE DOM of each platform. These selectors were written based on 2025 DOM
structures and may be stale:

| Platform | Status | Key Selectors to Verify |
|----------|--------|------------------------|
| ChatGPT | ⚠️ Likely stale | `[data-message-author-role]`, `article`, `#prompt-textarea` |
| Claude | ⚠️ Likely stale | `.font-claude-message`, `.user-message-block`, `fieldset div[contenteditable]` |
| Gemini | ⚠️ Likely stale | `message-content`, `.user-query`, `.input-area textarea` |
| DeepSeek | ❓ Unknown | `._user-message`, `.ds-markdown`, `#chat-input` |
| Kimi | ❓ Unknown | `.segment-content`, `.chat-segment` |
| Qwen | ❓ Unknown | `.chat-item`, `.message-item` |

**Recommendation:** After applying FIX-1 through FIX-3, load the extension in Chrome,
open each platform's DevTools console, and check for `[OmniContext] Content scan error`
messages. If `extractMessages()` returns `[]`, the selectors need updating.

---

## 6. Summary

The entire extension is non-functional because of **one root cause**: the
`webextension-polyfill` npm package is imported via bare specifier in the popup and
service worker, which browser extensions cannot resolve. This crashes both scripts
on startup, killing the badge, storage sync, and popup UI. The content script (which
was correctly bundled) runs fine but its results have nowhere to go.

Secondary issues include stale DOM selectors that cause zero message extraction, and a
Shadow DOM event boundary problem that prevents HUD dragging.

**Estimated total fix time: ~3 hours** (P0: 20 min, P1: 2 hrs, P2: 30 min).
