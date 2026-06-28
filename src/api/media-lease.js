// media-lease.js — demand-driven refcounted leases for toolbar camera (#camera) + mic analyser.
//
// Pattern mirrors registerSource (device-sources.js) for the refcount and liveOutput
// (keep-alive.js) for the handle shape. Camera/mic are INPUTS, not outputs — do not
// register with liveOutput (see CLAUDE.md). ADR 023.
//
// Usage (window-scoped, e.g. WM window):
//   const lease = acquireCamera();
//   // ... use #camera canvas / window.__ar_video ...
//   win._wmCleanup = () => { lease.release(); prevCleanup?.(); };
//
// Usage (run-scoped, i.e. user code consumers):
//   acquireCameraRunScoped();   // released automatically on reset — no manual release needed
//   acquireMicRunScoped();

import { onReset } from '../runtime/reset-registry.js';
import { notify } from '../events/index.js';

let _cameraStart = null, _cameraStop = null;
let _micStart    = null, _micStop    = null;
let _cameraCount = 0,    _micCount   = 0;

// Run-scoped leases released on reset. Each entry is tagged with the editor that
// acquired it so a reset of editor B does not release editor A's camera/mic lease
// (which would drop the refcount to 0 and stop a stream another editor still uses).
const _runScopedLeases = [];   // [{ handle, editorId }]

// ── Registration (called by camera.js / mic.js at init time) ─────────────────

export function initCameraLease(start, stop) { _cameraStart = start; _cameraStop = stop; }
export function initMicLease(start, stop)    { _micStart    = start; _micStop    = stop; }

// ── Lease primitives ─────────────────────────────────────────────────────────

function _makeHandle(onRelease) {
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      onRelease();
    },
  };
}

/** Acquire the toolbar camera stream. Returns a handle with release(). */
export function acquireCamera() {
  _cameraCount++;
  if (_cameraCount === 1) _cameraStart?.();
  return _makeHandle(() => {
    _cameraCount = Math.max(0, _cameraCount - 1);
    if (_cameraCount === 0) _cameraStop?.();
  });
}

/** Acquire the toolbar mic analyser. Returns a handle with release(). */
export function acquireMic() {
  _micCount++;
  if (_micCount === 1) _micStart?.();
  return _makeHandle(() => {
    _micCount = Math.max(0, _micCount - 1);
    if (_micCount === 0) _micStop?.();
  });
}

// ── Run-scoped helpers (auto-released on reset) ───────────────────────────────

/**
 * Acquire the toolbar camera for a user-code consumer.
 * The lease is released automatically on every reset — caller need not call release().
 * Guard with a module-level flag to avoid re-acquiring on each frame in a tight loop.
 */
export function acquireCameraRunScoped() {
  const h = acquireCamera();
  _runScopedLeases.push({ handle: h, editorId: window.__ar_active_editor_id });
  return h;
}

/** Acquire the toolbar mic for a user-code consumer. Auto-released on reset. */
export function acquireMicRunScoped() {
  const h = acquireMic();
  _runScopedLeases.push({ handle: h, editorId: window.__ar_active_editor_id });
  return h;
}

// ── Diagnostics ──────────────────────────────────────────────────────────────

export function getCameraCount() { return _cameraCount; }
export function getMicCount()    { return _micCount; }

// ── Reset handler ─────────────────────────────────────────────────────────────

function _cleanupRunScoped(editorId) {
  // Scope to the resetting editor so a lease held by another editor's still-live
  // output survives. editorId == null → full release (global / hard reset).
  const survivors = [];
  for (const l of _runScopedLeases) {
    if (editorId == null || l.editorId == null || l.editorId === editorId) l.handle.release();
    else survivors.push(l);
  }
  _runScopedLeases.length = 0;
  _runScopedLeases.push(...survivors);
}
onReset(_cleanupRunScoped);
