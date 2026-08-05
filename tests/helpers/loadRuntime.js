/**
 * Loads OmniContext runtime sources into an isolated vm context.
 *
 * Runtime files are plain scripts that attach onto the global `OmniContext`
 * namespace, so tests evaluate them the same way the browser does instead of
 * importing them as modules. Scripts are named with their absolute file URL so
 * `node --experimental-test-coverage` attributes coverage back to src/.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    Object.assign(this, options);
  }
}

/**
 * @param {string[]} files runtime sources, in dependency order
 * @param {Object} [globals] extra globals exposed to the loaded sources
 * @returns {{ OmniContext: Object, context: Object }}
 */
export function loadRuntime(files, globals = {}) {
  const sandbox = {
    console,
    URL,
    Event: FakeEvent,
    InputEvent: FakeEvent,
    ...globals
  };
  const context = vm.createContext(sandbox);

  for (const file of ['src/content/omniNamespace.js', ...files]) {
    // Each runtime file is a separate injected script, evaluated in its own
    // scope so that top-level declarations of the same name in two files (e.g.
    // `class ModelRegistry` and its `const ModelRegistry` alias) do not clash.
    const source = readFileSync(join(ROOT, file), 'utf8');
    vm.runInContext(`(function () {${source}\n})();`, context, { filename: pathToFileURL(join(ROOT, file)).href });

    // Sources published to the namespace are also exposed as globals, matching
    // the shared global object the injected scripts see in the browser.
    for (const [name, value] of Object.entries(context.OmniContext)) {
      if (!(name in sandbox)) sandbox[name] = value;
    }
  }

  return { OmniContext: context.OmniContext, context };
}

export { FakeEvent };
