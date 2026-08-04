# SPEC-8: OmniContext v1.1 — Final Release Conclusion

**Spec Version:** 8.0.0  
**Date:** 2026-08-04  
**Status:** Final v1.1 release preparation  
**Relates To:** [SPEC-7](./spec7.md)

---

## 1. Final Conclusion

OmniContext v1.1 is complete as a manually authored, cross-browser WebExtension source release. The implementation includes the v1.1 health-monitoring features, critical runtime fixes, Firefox compatibility, direct source loading, reproducible builds, compliance tests, and AMO packaging workflow.

The generated concatenated content bundle and its custom bundler were removed to satisfy Mozilla's source-code submission requirement. The add-on now loads separate human-authored JavaScript files directly in declared dependency order. The build script only generates browser-specific manifest fields, validates referenced files, and copies source files unchanged.

---

## 2. v1.1 Feature Completion

- Cross-browser Chrome/Firefox manifest generation.
- Firefox dynamic main-world interceptor fallback.
- Network and DOM model detection for supported LLM platforms.
- GPT, Claude, Gemini, DeepSeek, Kimi, and Qwen model registry updates.
- Five-signal Context Bloat and Context Rot scoring.
- Combined Health Score with Optimal, Dense, Degrading, and Bloated tiers.
- Floating Shadow DOM HUD with pointer-capture dragging.
- Popup live metrics, model information, debug toggle, and explicit simulation state.
- Local-only processing with no external APIs, tracking, or chat-content uploads.
- Summary-prompt injection for context migration.

---

## 3. Mozilla Source Compliance

The final source tree contains no project-generated concatenated bundle, transpiled output, minified source, or template-generated extension file.

### Removed
- `src/content/content.bundle.js`
- `scripts/bundle-content.js`
- `bundle:content` package script

### Direct source architecture
- `src/content/omniNamespace.js` initializes the shared namespace.
- Core files expose classes through `OmniContext`.
- Adapters, UI, and content orchestration consume the namespace directly.
- `popup.html` loads core files and `popup.js` directly.
- `manifest.base.json` loads content files directly in dependency order.
- `scripts/build.js` validates and copies files without transforming source.

---

## 4. Reproducible Build

### Requirements
- Linux, macOS, or Windows.
- Node.js 18 or newer.
- npm 9 or newer.
- ZIP utility for packaging.
- No runtime npm dependencies are required.

### Commands

```bash
npm install
npm test
npm run build:firefox
npm run build
npm run package
```

The Firefox AMO package is:

```text
omnicontext-v1.2.0-firefox.zip
```

Its archive root contains `manifest.json` directly, with no enclosing directory.

---

## 5. Verification Results

- Metrics and model registry tests pass.
- Source-compliance tests pass.
- No `import` or `export` syntax remains in runtime source files.
- No `content.bundle.js` reference remains in source or manifests.
- No generated-bundle marker remains.
- Manifest-referenced source files exist.
- `dist/chrome/` and `dist/firefox/` files match source files byte-for-byte.
- Chrome build retains the MAIN-world interceptor and module service worker.
- Firefox build retains `background.scripts` and excludes the MAIN-world manifest entry.
- Generated Firefox ZIP is below Mozilla's 200 MB limit.
- Existing Firefox extension ID remains unchanged.

---

## 6. AMO Submission

1. Run `npm run build:firefox`.
2. Run `npm run package` or create the Firefox ZIP from `dist/firefox/` with its contents at the archive root.
3. Upload `omnicontext-v1.2.0-firefox.zip` to the existing AMO listing using **Upload New Version**.
4. Use the v1.1 release notes and reviewer notes from the submission checklist.
5. Explain that the source build uses direct manually authored files and that `scripts/build.js` only validates manifests and copies source files.
6. Do not provide personal account credentials; reviewers can test with their own controlled accounts on supported LLM websites.

---

## 7. Remaining Manual QA

Automated validation cannot replace browser testing. Before final AMO submission, manually verify in Firefox:

- Popup opens without console errors.
- HUD appears on supported LLM pages.
- Live conversations produce non-zero metrics.
- Popup shows `Live data` when content-script metrics are available.
- HUD pointer dragging, expand/collapse, close, and summary injection work.
- Model switching updates the displayed model.
- Debug logging only reports metadata.
- Unsupported or empty pages show explicit `Simulation / No live data` in the popup.

---

## 8. Release Status

**OmniContext v1.1 is ready for final Firefox AMO upload after manual browser QA.** The source repository now provides a reproducible, reviewable, non-generated source layout and a build process that satisfies the stated Mozilla source-code constraints.
