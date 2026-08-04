# OmniContext — Universal LLM Context & Bloat Monitor (V1.1.0)

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
npm install            # installs webextension-polyfill
npm run build          # bundle content script + build both dist/chrome and dist/firefox
npm run build:chrome   # dist/chrome/ only
npm run build:firefox  # dist/firefox/ only
npm test               # run unit tests
npm run package        # zip both builds
```

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
- Source lives in ES modules under `src/`; the manifest loads the generated `src/content/content.bundle.js`.
- Run `npm run bundle:content` after editing content-script modules to regenerate the bundle.
- Specifications live in `.specs/` (SPEC-1 design → SPEC-2 implementation log → SPEC-3 review → SPEC-4 fixes).
