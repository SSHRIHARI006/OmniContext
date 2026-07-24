# Technical Specification Document: OmniContext Extension

**Document Version:** 1.0.0

**Target Platform:** WebExtension (Manifest V3 — Chrome, Edge, Brave, Firefox)

**Project Name:** OmniContext (Universal LLM Context & Bloat Monitor)

---

## 1. Project Overview & Scope

### 1.1 Objective

OmniContext is a lightweight browser extension that provides real-time visibility into context window usage, token density, and performance degradation ("context bloat") across major LLM web applications (ChatGPT, Claude, Gemini, DeepSeek, Kimi, Qwen).

### 1.2 Core Value Proposition

* **Universal Multi-Platform Support:** Single engine that adapts dynamically to different DOM schemas and tokenizers.
* **Context Health & Bloat Score:** Beyond raw token counts, quantifies degradation risks ("Lost in the Middle", high code density, memory pressure).
* **Zero External API Dependencies:** All token calculations, text extractions, and metric computations run 100% locally in the browser.
* **Seamless Context Migration:** One-click automated summary generation to transition long-running conversations into fresh sessions.

---

## 2. System Architecture & Data Flow

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
│   │  Platform Adapter   ├──────>│       MutationObserver           │   │
│   │  (Scrapes DOM/Role) │       │   (Debounced @ 500ms limit)      │   │
│   └──────────┬──────────┘       └────────────────┬─────────────────┘   │
│              │                                   │                     │
│              └─────────────────┬─────────────────┘                     │
│                                ▼                                       │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                    Tokenization Engine                         │   │
│   │     • js-tiktoken (o200k_base baseline)                        │   │
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

## 3. Data Schema & Core Interfaces

### 3.1 Message Object (`ChatMessage`)

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  codeText: string;
  timestamp: number;
}

```

### 3.2 Metrics Output (`MetricsPayload`)

```typescript
interface MetricsPayload {
  totalTokens: number;
  userTokens: number;
  assistantTokens: number;
  totalWords: number;
  totalChars: number;
  turnCount: number;
  userRatio: number;         // Percentage (0 - 100)
  assistantRatio: number;    // Percentage (0 - 100)
  codeDensity: number;       // Percentage of tokens inside code blocks
  capacityUsed: number;      // Percentage against platform soft limit
  bloatScore: number;        // Weighted index (0 - 100)
  statusLevel: 'optimal' | 'dense' | 'bloated';
  softLimit: number;
  remainingTokens: number;
}

```

### 3.3 Platform Limit Registry (`PlatformConfig`)

```typescript
interface PlatformConfig {
  hostPattern: RegExp;
  platformKey: 'chatgpt' | 'claude' | 'gemini' | 'deepseek' | 'kimi' | 'generic';
  softLimitTokens: number;
  hardLimitTokens: number;
  tokenMultiplier: number;
}

```

---

## 4. Functional Requirements (FR)

### FR-1: Platform Ingestion & Adapters

* **FR-1.1:** Automatically detect host provider via hostname matching upon content script injection.
* **FR-1.2:** Fall back to a generic query selector (`article`, `[role="data-message"]`, `.message`) if host domain is unrecognized.
* **FR-1.3:** Extract user prompts vs. assistant responses cleanly, stripping out UI control buttons, copy handles, and feedback elements.

### FR-2: Real-time Mutation & Performance Optimization

* **FR-2.1:** Attach a `MutationObserver` to the main chat container element.
* **FR-2.2:** Debounce parsing executions to **500ms** to prevent CPU spikes while assistant responses stream line-by-line.

### FR-3: Token Engine & Heuristics

* **FR-3.1:** Execute local Byte-Pair Encoding (BPE) using `js-tiktoken` with `o200k_base` encoding.
* **FR-3.2:** Apply provider-specific multiplier weights to model non-OpenAI tokenization differences:
* ChatGPT (`gpt-4o`/`o1`): `1.00×`
* Claude 3.5 / 3.7: `1.18×`
* Gemini 1.5 / 2.0: `1.05×`
* DeepSeek / Qwen / CJK Models: `1.10×`



### FR-4: Context Health & Bloat Score Formula

* **FR-4.1:** Compute a composite **Context Bloat Score ($S_{bloat}$)** on a 0–100 scale:

$$S_{bloat} = \min\left(100, \; 0.60 \cdot C_{capacity} + 0.20 \cdot T_{turn} + 0.20 \cdot D_{code}\right)$$

Where:

* $C_{capacity} = \min\left(100, \frac{\text{Total Tokens}}{\text{Soft Limit}} \times 100\right)$
* $T_{turn} = \min\left(100, \frac{\text{Turn Count}}{30} \times 100\right)$
* $D_{code} = \min\left(100, \frac{\text{Code Tokens}}{\text{Total Tokens}} \times 100\right)$
* **FR-4.2:** Classify health status thresholds:
* **0 – 49 (Optimal 🟢):** High retention, low latency.
* **50 – 74 (Dense 🟡):** Slight attention dilution risk.
* **75 – 100 (Bloated 🔴):** High "Lost in the Middle" risk; migration recommended.



### FR-5: Floating Overlay HUD Widget

* **FR-5.1:** Inject a minimal floating UI overlay into target pages using **Shadow DOM** to prevent CSS leaks from the host site.
* **FR-5.2:** Render compact badge view showing: `[ Tokens Used ] | [ Bloat Score % ]`.
* **FR-5.3:** Allow dragging, docking, and collapsing the widget into a mini-badge.

### FR-6: "Summarize & Migrate" Engine

* **FR-6.1:** When Bloat Score exceeds `75%`, display an actionable migration alert.
* **FR-6.2:** Clicking **"Prepare Summary"** populates the active web page prompt input box with a structured context-aggregation prompt:

> *"We are reaching memory context limits in this session. Please generate a structured Markdown summary of our discussion, including: key requirements, established architectural decisions, ongoing tasks, and critical code snippets so I can paste it into a fresh session."*

---

## 5. Matrix of Supported Platforms & Soft Limits

| Provider / Domain | Selector Strategy | Soft Limit (Tokens) | Token Multiplier |
| --- | --- | --- | --- |
| **chatgpt.com** | `[data-message-author-role]` | 24,000 | 1.00× |
| **claude.ai** | `.font-claude-message`, `.user-message-block` | 32,000 | 1.18× |
| **gemini.google.com** | `message-content`, `.user-query` | 64,000 | 1.05× |
| **chat.deepseek.com** | `._user-message`, `.ds-markdown` | 22,000 | 1.10× |
| **kimi.moonshot.cn** | `.segment-content` | 24,000 | 1.10× |
| **tongyi.aliyun.com** | `.chat-item` | 24,000 | 1.10× |

---

## 6. Non-Functional Requirements (NFR)

* **NFR-1 (Privacy & Security):**
* Absolutely **no external tracking or analytics**.
* No user chat content, prompts, or metadata sent to external servers.
* Manifest permissions restricted strictly to `storage` and host match patterns.


* **NFR-2 (Performance Impact):**
* CPU overhead < 1% during streaming responses.
* Extension JavaScript bundle size < 1.5 MB total.
* Memory footprint < 30 MB per active tab.


* **NFR-3 (DOM Resilience):**
* Adapter failures must fail silently without breaking or blocking host web page functionality.



---

## 7. Directory & File Layout

```
omnicontext-extension/
├── manifest.json
├── package.json
├── webpack.config.js
├── src/
│   ├── background/
│   │   └── serviceWorker.js
│   ├── content/
│   │   ├── content.js
│   │   ├── adapters/
│   │   │   ├── baseAdapter.js
│   │   │   ├── chatgptAdapter.js
│   │   │   ├── claudeAdapter.js
│   │   │   ├── deepseekAdapter.js
│   │   │   └── genericAdapter.js
│   │   ├── core/
│   │   │   ├── tokenEngine.js
│   │   │   ├── metricsCalculator.js
│   │   │   └── migrationPrompt.js
│   │   └── ui/
│   │       ├── shadowContainer.js
│   │       └── floatingWidget.css
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   └── assets/
│       └── icons/

```

---

> **Summary:** This specification provides a complete blueprint for an end-to-end, multi-provider LLM context monitoring extension. It covers technical data flows, mathematical models for bloat metrics, and architectural boundaries.
