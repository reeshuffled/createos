# ADR 005: Add PIXI.js and WebGL/GLSL as Optional Layers

**Status:** Decided  
**Date:** 2026-06-23

## Decision

Add PIXI.js (v7, WebGL scene graph) and `GLShader` (WebGL/GLSL fragment shaders) as opt-in layers alongside the existing draw/Shader APIs. The `draw` object and `Shader` (WebGPU) remain the primary drawing primitives.

## Context

ADR 001 rejected PIXI.js in favour of a thin Canvas2D `draw` wrapper. The reasoning was sound for that scope: live-coding idioms favour stateless immediacy over scene graph object lifecycle. PIXI's model (`new Sprite()`, `.addChild()`, `.destroy()`) clashes with code that re-runs from scratch on every edit.

Two things have changed since then:

1. **Agents are first-class users.** Agents generate GLSL fluently (enormous ShaderToy/WebGL corpus) and struggle with WGSL (thin corpus, structural differences). Blocking them to WebGPU/WGSL halves the effective quality of LLM-generated shader code.

2. **Browser reach is a real constraint.** `Shader` requires WebGPU (Chrome 113+, Safari 18+, Edge 113+). Firefox and older Safari browsers cannot run `Shader` at all. A WebGL fallback covers 100% of browsers.

## Why PIXI now (addressing ADR 001's objections)

**Bundle cost** — PIXI adds ~600 KB. Accepted tradeoff: the draw API still handles all immediate-mode use cases; PIXI is opt-in and tree-shaken from builds that don't touch it. Users who only use draw/Shader pay nothing.

**Layer system conflict** — resolved. PIXI's canvas is mounted at z=25 inside the same `#canvasWrapper`/`#fsContainer` stack as the existing layers. Draw (z=0), PIXI (z=25), Shader (z=30) compose cleanly as sibling `<canvas>` elements.

**Shader interop** — PIXI (WebGL) and Shader (WebGPU) are separate GPU contexts. They coexist on the same page (this is standard; browsers handle it). The interaction footprint is transparent to users: PIXI pixels at z=25 appear behind WebGPU shader pixels at z=30.

**Timer/hot-reload integration** — partially resolved. The PIXI renderer's `render()` call is intercepted to skip drawing when `window.__ar_paused`. The ticker still fires (to keep Blockly UI responsive), but no pixels are written to the canvas. On reset (`cleanupPixi()`): all stage children removed, all `pixi.tick()` callbacks unregistered.

**Error quality** — no change. PIXI stack traces are WebGL-level. Accepted: errors at PIXI's abstraction level are legible enough for the audience.

**Blockly codegen** — resolved. PIXI blocks added to the PIXI toolbox category. `pixi_graphics_circle`, `pixi_text`, `pixi_sprite`, `pixi_tick`, `pixi_set_pos` etc. emit valid PIXI v7 calls.

**Why it fits now** — the use cases that benefit from PIXI (sprites, per-object hit-testing, particles, text with filters, animated scene graphs) are genuinely different from the use cases draw already handles. The failure mode in ADR 001 was PIXI replacing draw. Here PIXI is additive: draw for immediate-mode live coding, PIXI for retained scene graph work.

## What GLShader provides

`GLShader` (WebGL/GLSL) mirrors the `Shader` API surface exactly:

```js
new GLShader(fragBody, { z, opacity, video })
.start() / .stop() / .set() / .bind() / .opacity() / .z()
```

Three source modes, auto-detected:
1. `void main()` or `#version` present → full GLSL, used as-is
2. `void mainImage(out vec4, in vec2)` → **ShaderToy mode** — wrapped to call from `main()`
3. Otherwise → fragment body, wrapped with `uv/time/mouse/custom` pre-declared

This means any ShaderToy shader pastes in with zero edits. Uniforms map to the same conceptual layout as `Shader`: `uResolution`, `uMouse`, `uTime`, `uCustom`.

## What it doesn't do

- PIXI does not replace draw for immediate-mode idioms (all existing code unchanged)
- PIXI's ticker is not frozen by `freezeTimers`/`restoreTimers` — animation pauses visually (render skipped) but not mechanically
- GLShader does not support compute shaders (WebGL constraint)
- PIXI v7 (not v8) — chosen for synchronous init, stable API, and larger agent training corpus

## Consequences

- `window.pixi` (PIXI.Application), `window.Stage`, `window.PIXI` added to global scope
- `window.GLShader`, `window.GLSL_PRESETS` added to global scope
- `initPixi()` runs once at `window.onload` — PIXI canvas always present, transparent until used
- `cleanupPixi()` + `cleanupGLShaders()` called on every reset alongside existing cleanup functions
- docs/pixi.md and docs/glsl-shader.md added
- PIXI (colour 290) and GLShader (colour 15) toolbox categories added to Blockly
- toolkit drawer gains PIXI and GLShader sections with "why this vs that" as first entry
