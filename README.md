# OmniContext — Universal LLM Context & Bloat Monitor (V1.2.0)

**OmniContext** is a lightweight, zero-external-API WebExtension (Manifest V3) that provides real-time visibility into context window usage, token density, and context degradation risk ("context bloat"/"context rot") across major LLM web interfaces (**ChatGPT**, **Claude**, **Gemini**, **DeepSeek**, **Kimi**, **Qwen**).

Cross-browser compatible with **Firefox**, **Chrome**, **Edge**, **Brave**, **Opera**, **Vivaldi**, and **Arc**.

---

## Key Features & Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TARGET PAGE DOM (Main World)                     │
│   [ ChatGPT / Claude / Gemini / DeepSeek / Kimi / Qwen Web Interfaces ] │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
┌─────────────────────────────┐              ┌─────────────────────────────┐
│  Network Model Interceptor  │              │      DOM Mutations          │
│  (fetch/XHR patch → model   │              │   (Stream & Messages)       │
│   IDs via postMessage)      │              └──────────────┬──────────────┘
└──────────────┬──────────────┘                             │
               │                                             ▼
               └──────────────┬──────────────────────────────┘
                              ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         CONTENT SCRIPT (Isolated)                      │
│                                                                        │
│   ┌─────────────────────┐       ┌──────────────────────────────────┐   │
│   │  Platform Adapters  ├──────>│       MutationObserver           │   │
│   │  (Scrapes DOM/Role) │       │   (Debounced @ 500ms limit)      │   │
│   └──────────┬──────────┘       └───────────────┬──────────────────┘   │
│              │                                  │                      │
│              └────────────────┬─────────────────┘                      │
│                               ▼                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                    Tokenization Engine                         │   │
│   │     • Fast o200k_base subword BPE token estimation             │   │
│   │     • Model-specific multiplier heuristics                     │   │
│   └────────────────────────────┬───────────────────────────────────┘   │
│                                │                                       │
│                                ▼                                       │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │      Metrics & Context Health Calculator                       │   │
│   │     • 5-signal Bloat & Rot composite scores                    │   │
│   │     • Health Score = max(Bloat, Rot) · 4 status tiers          │   │
│   │     • Capacity, Redundancy, Info Decay, Turn Depth, Code Rep.  │   │
│   └────────────────────────────┬───────────────────────────────────┘   │
│                                │                                       │
└────────────────────────────────┼───────────────────────────────────────┘
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
┌────────────────────────────┐              ┌────────────────────────────┐
│   Floating Overlay HUD     │              │    Extension Popup Panel   │
│ (Injected Shadow DOM UI)   │              │   (Detailed Analytics)     │
└────────────────────────────┘              └────────────────────────────┘
```

### Model Detection (Two-Layer)
1. **Network Interception (primary):** a main-world script patches `fetch`/`XMLHttpRequest` and extracts the model ID from API request/response payloads. On Firefox, the interceptor is injected dynamically (no `"world": "MAIN"` support).
2. **DOM Scraping (fallback):** resilient `data-testid` / `aria-*` selectors with text-content matching.

### Context Health Scoring
- **Bloat** — how saturated/redundant the context is (`0.35·Cp + 0.30·Ri + 0.15·Id + 0.10·Td + 0.10·Dr`)
- **Rot** — how likely the model is losing information (`0.25·Cp + 0.20·Ri + 0.25·Id + 0.20·Td + 0.10·Dr`)
- **Health** — `max(Bloat, Rot)`, shown in the HUD and popup
- **Tiers:** 0–39 Optimal 🟢 · 40–64 Dense 🟡 · 65–84 Degrading 🟠 · 85–100 Bloated 🔴

---

## Building & Loading

### Prerequisites
- Node.js 18+ (only for building/packaging — the extension itself has no build-time runtime)

### Build
```bash
npm install            # installs Node/npm metadata; no runtime dependencies
npm run build          # validate manifests + copy direct source files to both dist builds
npm run build:chrome   # build dist/chrome/ only
npm run build:firefox  # build dist/firefox/ only
npm test               # run unit and source-compliance tests
npm run test:coverage  # same tests plus a per-file coverage report
npm run package        # create Chrome and Firefox ZIPs
```

Tests are dependency-free: runtime sources are evaluated in a `node:vm` context
(`tests/helpers/loadRuntime.js`) against a minimal DOM double
(`tests/helpers/fakeDom.js`). The UI layers — `src/content/content.js`,
`src/content/ui/shadowContainer.js` and `src/popup/popup.js` — are not covered by
unit tests and are verified by loading the extension in a browser.

The build produces:
- `dist/chrome/` — Chrome, Edge, Brave, Opera, Vivaldi, Arc (`background.service_worker`, `"world": "MAIN"` interceptor)
- `dist/firefox/` — Firefox (`background.scripts`, dynamic interceptor injection)

### Loading / Reloading

**Firefox:**
1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `dist/firefox/manifest.json`.
3. Click **Reload** next to OmniContext to apply changes; reload active chat pages.

**Chrome / Edge / Brave:**
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `dist/chrome/` folder.
4. Click the **Reload** icon to apply changes.

---

## Features Summary
- **Real-time Global ON/OFF Toggle**: Turn monitoring on/off instantly via the extension popup without restarting the browser.
- **Removable Overlay**: Click `[×]` on the badge or expanded HUD card to dismiss it for your active session.
- **Resizable & Movable HUD**: Drag the HUD anywhere; grab the bottom-right corner of the card to resize.
- **Cross-Platform Auto-Detection**: Dynamically detects models (Gemini 2.5/2.0/1.5, GPT-4.1/GPT-4o/o1/o3/o4-mini, Claude 4/3.7/3.5, DeepSeek-V3/R1, Kimi K1.5, Qwen 3) via network interception + DOM fallback, and updates token limits accordingly.
- **Health / Bloat / Rot Scoring**: 5-signal composite score with a "Degrading" warning tier.
- **Summarize & Migrate**: One-click context summary prompt injection when the conversation is dense/bloated.

---

## Development
- Source lives in separate manually maintained classic JavaScript files under `src/`; manifests load those files directly in dependency order.
- `scripts/build.js` only validates manifests, generates browser-specific manifest fields, and copies source files unchanged. It does not concatenate, transpile, minify, or template source code.
- Open the popup's **Debug logging** checkbox to persist diagnostics; logs include adapter/model/count metadata only, never chat text.
- If the popup cannot reach a live content script, it displays **Simulation / No live data** instead of silently presenting synthetic metrics.
- Specifications live in `.specs/` (SPEC-1 design → SPEC-2 implementation log → SPEC-3 review → SPEC-4 fixes → SPEC-5 audit → SPEC-6 implementation → SPEC-7 compliance migration → SPEC-8 final release).
