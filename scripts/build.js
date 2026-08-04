#!/usr/bin/env node
/**
 * OmniContext build script.
 * Generates browser-specific manifests from manifest.base.json and copies
 * the extension tree into dist/<browser>/. All Chromium-based browsers
 * (Chrome, Edge, Brave, Opera, Vivaldi, Arc) use the Chrome build.
 *
 * Usage:
 *   node scripts/build.js chrome   → dist/chrome/
 *   node scripts/build.js firefox  → dist/firefox/
 *   node scripts/build.js all      → both (default)
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');
const TARGETS = ['chrome', 'firefox'];

function loadBaseManifest() {
  return JSON.parse(readFileSync(join(ROOT, 'manifest.base.json'), 'utf8'));
}

function buildManifest(base, browser) {
  const manifest = JSON.parse(JSON.stringify(base));

  if (browser === 'chrome') {
    manifest.background = { service_worker: 'src/background/serviceWorker.js' };
    delete manifest.browser_specific_settings;
    // Chromium supports "world": "MAIN" for the network model interceptor.
    manifest.content_scripts = [
      ...(manifest.content_scripts || []),
      {
        matches: base.host_permissions,
        js: ['src/content/interceptor.js'],
        world: 'MAIN',
        run_at: 'document_start'
      }
    ];
  } else if (browser === 'firefox') {
    manifest.background = { scripts: ['src/background/serviceWorker.js'] };
    manifest.browser_specific_settings = {
      gecko: {
        id: 'omnicontext@omnicontext.extension',
        strict_min_version: '140.0',
        data_collection_permissions: { required: ['none'] }
      }
    };
    // Firefox has no "world": "MAIN"; the interceptor is injected dynamically
    // by the content script (see src/content/content.js).
  }

  return manifest;
}

function buildTarget(browser) {
  const outDir = join(ROOT, 'dist', browser);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const manifest = buildManifest(loadBaseManifest(), browser);
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  cpSync(SRC, join(outDir, 'src'), { recursive: true });

  for (const file of ['README.md']) {
    const srcFile = join(ROOT, file);
    if (existsSync(srcFile)) cpSync(srcFile, join(outDir, file));
  }

  console.log(`[build] manifest.json + src/ → dist/${browser}/`);
}

const target = process.argv[2] || 'all';
if (target === 'all') {
  for (const t of TARGETS) buildTarget(t);
} else if (TARGETS.includes(target)) {
  buildTarget(target);
} else {
  console.error(`Unknown target "${target}". Expected one of: ${TARGETS.join(', ')} or "all".`);
  process.exit(1);
}
