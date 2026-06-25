# ADR 009: An Output-Liveness Handle (`liveOutput`)

**Status:** Decided
**Date:** 2026-06-25

## Decision

Outputs register their liveness through a single helper,
`liveOutput(token)` (`src/runtime/keep-alive.js`), which returns a handle with an
idempotent `release()`. Outputs no longer touch `window.__ar_keepAlive`
directly.

## Context

Whether a program is still "running" is decided by the active editor's
`_keepAlive` Set (pointed to by `window.__ar_keepAlive`); the idle watcher stops
a program once it empties. Each output type open-coded the same dance —
`window.__ar_keepAlive ??= new Set(); .add(this)` on start,
`window.__ar_keepAlive?.delete(this)` on stop — across **10 files**, and
`GLShader`/`Shader` each had **two** delete sites (error path + destroy), so two
chances to forget one.

Worse, the delete sites **re-read** `window.__ar_keepAlive` at stop time. But
that pointer is reassigned to whichever editor most recently ran. So starting an
output in editor 1, then running editor 2, then stopping the output deleted the
token from editor 2's Set (a no-op) and left it in editor 1's Set forever —
editor 1 never went idle. A latent leak.

(`wm.js` was the one site that already did it correctly: it captured the Set on
the window as `_wmKeepAliveSet` and deleted from that. It is left as-is — its
registration is tied to window-close, not a start/stop pair — and stands as the
pattern the handle generalises.)

## Design

```js
export function liveOutput(token) {
  const set = (window.__ar_keepAlive ??= new Set());  // capture NOW
  set.add(token);
  let released = false;
  return { release() { if (!released) { released = true; set.delete(token); } } };
}
```

The handle **captures** the Set at registration and releases from that same Set,
fixing the cross-editor-switch leak. `release()` is idempotent, so an output's
multiple stop paths (error path + destroy) are all safe.

Migrated consumers: `Shader`, `GLShader`, the three viz classes, `Media`,
`ThreeScene`, `render-pipeline`, and `draw.backdrop` — each now does
`this._live = liveOutput(this)` (or a sentinel token) on start and
`this._live?.release()` on every stop path.

## Consequences

- The add/remove invariant lives in one module instead of being trusted across
  10 call sites; the double-delete-site footgun is gone.
- The cross-editor-switch leak is fixed and regression-guarded
  (`tests/keep-alive.test.js`).
- Inputs (camera/mic) still must NOT register — that rule is unchanged and
  documented at the call sites and in CLAUDE.md.
