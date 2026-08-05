/*
 * OmniContext shared namespace.
 * Runtime source files are loaded directly by the browser in dependency order;
 * this file provides the explicit namespace used between those files, plus the
 * shared error reporting helpers. Failures are always surfaced at warn/error
 * level (console.debug is hidden by default in Chrome/Firefox devtools, so it
 * cannot be used to report errors).
 */
(function (root) {
  const ns = (root.OmniContext = root.OmniContext || {});

  function format(scope, error) {
    const name = error && error.name ? error.name : 'Error';
    const message = error && error.message ? error.message : String(error);
    return `[OmniContext] ${scope}: ${name}: ${message}`;
  }

  ns.logError = function logError(scope, error, details) {
    console.error(format(scope, error), details || {});
  };

  ns.logWarn = function logWarn(scope, error, details) {
    console.warn(format(scope, error), details || {});
  };
})(globalThis);
