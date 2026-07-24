# OmniContext — Universal LLM Context & Bloat Monitor (V1.0.0)

**OmniContext** is a lightweight, zero-external-API WebExtension (Manifest V3) that provides real-time visibility into context window usage, token density, and context degradation risk ("context bloat") across major LLM web interfaces (**ChatGPT**, **Claude**, **Gemini**, **DeepSeek**, **Kimi**, **Qwen**).

Cross-browser compatible with **Firefox**, **Chrome**, **Edge**, **Brave**, and **Safari**.

---

## 🌟 Key Features & Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TARGET PAGE DOM (Main World)                     │
│   [ ChatGPT / Claude / Gemini / DeepSeek / Kimi / Qwen Web Interfaces ] │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ DOM Mutations (Stream & Messages)
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
│   │                  Metrics & Bloat Calculator                    │   │
│   │     • Token Count, User/Assistant Ratio, Code Density          │   │
│   │     • Context Bloat Score (0 - 100) & Degradation Risk         │   │
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

---

## 🚀 How to Load & Update in Firefox & Chrome

### 🦊 Updating / Reloading in Firefox:
1. Open **Firefox** and navigate to `about:debugging#/runtime/this-firefox` (or enter `about:debugging` in the URL bar and click **This Firefox** on the left menu).
2. Under **Temporary Extensions**, locate **OmniContext**.
3. Click the **Reload** button next to OmniContext.
4. If you have not loaded it yet:
   - Click **Load Temporary Add-on...**
   - Select the `manifest.json` file inside the `TOKEN_COUNTER` root folder.
5. Reload any active chat pages (ChatGPT, Gemini, Claude, etc.) to apply the changes.

---

### 🌐 Updating / Reloading in Chrome / Edge / Brave:
1. Open Chrome and navigate to `chrome://extensions`.
2. Ensure **Developer mode** is enabled (toggle in the top-right corner).
3. Locate **OmniContext** and click the **Reload** icon (circular arrow).
4. If not installed yet, click **Load unpacked** and choose the `TOKEN_COUNTER` folder.

---

## 🛠 Features Summary
- **Real-time Global ON/OFF Toggle**: Turn monitoring on/off instantly via the extension popup without restarting the browser.
- **Removable Overlay**: Click `[×]` on the badge or expanded HUD card to dismiss it for your active session.
- **Resizable Window**: Grab and drag the bottom-right corner of the HUD card to resize it to your preferred dimensions.
- **Movable Anywhere**: Drag the HUD anywhere across the screen using the top header or badge.
- **Cross-Platform Auto-Detection**: Dynamically detects models (Gemini 1.5/2.0, GPT-4o, Claude 3.5/3.7, DeepSeek-V3/R1, Kimi, Qwen) and updates token limits accordingly.
