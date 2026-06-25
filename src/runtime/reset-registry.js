// reset-registry.js — the single registry of teardown handlers run on every
// execution reset. Each API module registers its own cleanup beside its own
// code via onReset(); editor-instance.js calls runResetHandlers() in reset()
// and _softReset() instead of hand-maintaining (and duplicating) a 27-entry
// call list. New subsystem → onReset(cleanupX) in its module, nothing else.
// See ADR 008.

const _handlers = [];

// Register a teardown handler. Idempotent per function reference (ES modules are
// singletons, so a module's top-level onReset call runs exactly once anyway).
export function onReset(fn) {
  if (typeof fn === 'function' && !_handlers.includes(fn)) _handlers.push(fn);
}

// Run every registered handler. One throwing handler must not abort the rest —
// a leaked subsystem is bad, but a half-finished reset is worse.
export function runResetHandlers() {
  for (const fn of _handlers) {
    try { fn(); }
    catch (e) { console.error('[reset] handler failed:', e); }
  }
}

// Test/inspection helper.
export function _resetHandlerCount() { return _handlers.length; }
