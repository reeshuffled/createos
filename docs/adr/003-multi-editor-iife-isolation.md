# ADR 003: IIFE Injection for Multi-Editor Isolation (not iframes)

**Status:** Decided  
**Date:** 2026-06-23

## Decision

Each Editor Instance executes user code in an async IIFE whose wrapper injects per-editor APIs (`draw`, `getCanvas`, `getLayer`, timer functions) as named locals. Shared APIs (`Shader`, `audio`, `vision`, etc.) remain on `window`. Each editor manages its own timer registry, keepAlive set, and error routing. Execution is not isolated via `<iframe>`.

## Context

The IDE supports multiple simultaneous Editor Instances, each with its own canvas output, play/pause/stop controls, and console. Two isolation strategies were considered:

### Option A — IIFE injection (chosen)

Per-editor APIs are injected into the IIFE preamble:

```js
(async function() {
  const draw        = __ar_editor_1_draw;
  const getCanvas   = __ar_editor_1_getCanvas;
  const getLayer    = __ar_editor_1_getLayer;
  const setInterval = __ar_editor_1_setInterval;  // tracks to editor 1's registry
  // ...
  await window.__ar_audioReady;
  ${user_code}
})()
```

Callbacks and timer closures capture these locals at IIFE entry. Shared globals (`Shader`, `audio`, `vision`, `Camera`, `Media`, `wm`) remain on `window` and are accessible from all editors.

### Option B — iframe isolation

Each editor window is a real `<iframe>` with its own `window`. True isolation by construction.

## Why not iframes

**Shared API cost is prohibitive.** The APIs that must remain shared across editors are precisely the expensive ones:

- `Shader` (WebGPU) — initialises a GPU device at startup. WebGPU devices cannot be shared across frames; each iframe would init its own device, hitting per-origin device limits and wasting GPU memory.
- `audio` (Tone.js) — wraps a single `AudioContext`. Sharing across frames requires `postMessage` or `SharedWorker` plumbing.
- `vision` (MediaPipe) — WASM module loaded once; cross-frame sharing is not supported.
- `Camera` — `getUserMedia` streams referenced by `<video>` elements; cross-frame access blocked by browser security policies.

Effort estimate: ~1000+ lines of cross-frame plumbing vs ~300-400 lines for IIFE injection.

## Why IIFE injection is sufficient

The escape hatch (`window.draw.rect(...)`) is obscure — toolkit snippets and Blockly codegen never emit it. Real user code writes `draw.rect(...)` which correctly resolves to the IIFE local.

Timer isolation: each editor's `setInterval`/`setTimeout` wrappers track to that editor's own registry. `stopRunning()` on Editor 2 only clears Editor 2's timers. `EventTarget.prototype.addEventListener` is still patched globally but tagged per-editor for cleanup routing.

Error routing: each editor registers its injected `<script>` element; `window.onerror` maps the script URL back to the owning editor to route errors to the correct embedded console.

## Upgrade path

If true isolation becomes necessary (e.g., user-written `window.draw` bypass causes real problems), migrating to iframes is feasible. The per-editor instance model already encapsulates all state; the iframe boundary would slot in at the execute boundary. The cross-frame shared API problem would still need solving at that point.

## Consequences

- `draw`, `getCanvas`, `getLayer` removed from `window` as live values; still present as no-ops or last-editor fallbacks for compatibility with legacy single-editor code
- Toolkit snippets and Blockly codegen continue to work unchanged
- `window.Shader`, `window.audio`, etc. unchanged
- Per-editor timer registries replace the single `window.__ar_intervals` / `window.__ar_timeouts`
- Taskbar, console routing, and persistence are per-Editor-Instance concerns, not runtime concerns
