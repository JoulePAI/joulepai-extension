/**
 * Chrome MV3 compatibility shim.
 *
 * Chrome MV3 APIs already return Promises, so we just alias
 * chrome → browser. This replaces browser-polyfill.min.js which
 * breaks Chrome's runtime.sendMessage with extra arguments.
 */
if (typeof globalThis.browser === 'undefined') {
  globalThis.browser = globalThis.chrome;
}
