# SPEC-6: OmniContext v1.1 — Critical Runtime and Interaction Fixes

**Spec Version:** 6.0.0  
**Date:** 2026-08-04  
**Status:** Implemented  
**Relates To:** [SPEC-5](./spec5.md)

---

## 1. Summary

SPEC-5 identified the runtime cascade behind the reported symptoms: unresolved bare npm imports crashed the popup and service worker, HUD mouse dragging was unreliable across the Shadow DOM boundary, DOM selector coverage was fragile, and simulation fallback was silent.

SPEC-6 implements the approved fixes and verifies the generated Chrome and Firefox builds.

| Area | Result |
|------|--------|
| Runtime startup | Bare `webextension-polyfill` imports and dependency removed |
| Chrome service worker | Generated with `type: "module"` |
| Firefox service worker | Uses native `browser`/`chrome` API fallback without imports |
| HUD interaction | Pointer capture drag implementation |
| Message extraction | Unique nested-node filtering + broader semantic selectors |
| Diagnostics | Persisted debug toggle; metadata-only logging |
| Popup fallback | Visible `Simulation / No live data` state |
| Tests/build | 10 tests pass; both browser builds succeed |

---

## 2. Runtime Startup Fixes

### FIX-1 — Removed unresolved polyfill imports

`src/background/serviceWorker.js` and `src/popup/popup.js` now use:

```javascript
const browser = globalThis.browser || globalThis.chrome;
```

This avoids browser-extension module resolution failures. `webextension-polyfill` was removed from `package.json`, `package-lock.json`, and the runtime source tree.

### FIX-2 — Chrome module service worker

`scripts/build.js` now generates:

```json
{
  "background": {
    "service_worker": "src/background/serviceWorker.js",
    "type": "module"
  }
}
```

Firefox continues to receive its `background.scripts` configuration.

### FIX-3 — Generated artifacts

`npm run build` regenerates `src/content/content.bundle.js`, `dist/chrome/`, and `dist/firefox/`.

---

## 3. HUD Interaction

`src/content/ui/shadowContainer.js` now uses `pointerdown`, `pointermove`, `pointerup`, and `pointercancel` instead of mouse-only events.

- Pointer capture is established on the badge/header.
- The original capture target releases the pointer reliably.
- Document-level listeners provide a fallback when the pointer leaves the Shadow DOM host.
- `touch-action: none` prevents touch/pen scrolling during a drag.
- Close/minimize controls remain excluded from drag start.
- Existing click-to-expand behavior remains protected by `wasDragging`.

---

## 4. Extraction and Diagnostics

### Unique message candidates

`BaseAdapter.getUniqueMessageElements()` now combines selector cascades, removes duplicate nodes, and filters nested candidates when an ancestor already represents the same message. ChatGPT, Claude, and Gemini use this helper.

### Broader selectors

Added semantic fallback coverage including:

- ChatGPT: conversation-turn/message test IDs, `role="listitem"`, and `role="article"`.
- Claude: message/turn test IDs and semantic main-region roles.
- Gemini: message IDs, message test IDs, and semantic main-region roles.

### Debug logging

A popup **Debug logging** checkbox persists `debugEnabled` in `storage.local` and updates the active content script immediately.

When enabled, content diagnostics log only:

- Adapter/platform key
- Extracted message count
- Model name and detection source
- Error name for failed scans

No message text or chat content is logged.

---

## 5. Popup Fallback UX

The popup now distinguishes live and synthetic metrics:

- Live content-script or storage data shows a green `Live data` badge.
- Missing live data shows an orange `Simulation / No live data` badge.
- Automatic fallback displays a toast: `No live data — showing simulation`.
- Manual simulation selection uses the same explicit simulation indicator.

Synthetic metrics can no longer be mistaken for live measurements.

---

## 6. Documentation

README updates include:

- Dependency-free runtime/build wording.
- Debug logging instructions and privacy behavior.
- Explicit simulation fallback behavior.
- SPEC-6 in the companion specification chain.

---

## 7. Verification

### Tests

```text
npm test
# tests 10
# pass 10
# fail 0
```

### Build

```text
npm run build
# dist/chrome/ generated
# dist/firefox/ generated
```

### Generated manifest checks

- Chrome background: service worker plus `type: "module"` ✅
- Firefox background: `background.scripts` ✅
- Chrome MAIN-world interceptor present ✅
- Firefox MAIN-world entry absent; dynamic injection remains ✅
- `webextension-polyfill` dependency/import absent ✅

### Syntax checks

- `src/background/serviceWorker.js` ✅
- `src/popup/popup.js` ✅
- `src/content/content.bundle.js` ✅

---

## 8. Manual Browser QA

The remaining verification requires loading the generated folders manually:

1. Load `dist/firefox/` in Firefox through `about:debugging`.
2. Open a supported chat page and reload it.
3. Confirm the HUD receives non-zero metrics when messages are present.
4. Open the popup and verify `Live data`, badge values, and storage sync.
5. Drag the HUD with mouse, touch, or pen input; click the badge to expand/collapse.
6. Enable **Debug logging** and confirm only metadata appears in the page console.
7. Visit a page without live content data and confirm the popup explicitly shows simulation mode.
