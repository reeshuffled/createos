# ADR 012: An API-Detection Coherence Gate (keep the central table; don't self-declare)

**Status:** Decided
**Date:** 2026-06-25

## Decision

Keep run-time API detection as the single central table `API_PATTERNS` in
`src/editor/api-detector.js`. Do **not** push each API's activation regex into its
own `registerAPI` / `_registerBuiltin` call. Instead, guard the central table with
a build-time **coherence gate** — a test asserting that every detected key
corresponds to a real registered API, and that no window/audio-opening API is
silently missing a pattern.

## Context

`detectAPIUsage(code)` returns ~16 booleans (`usesAudio`, `usesCamera`,
`usesVision`, `shaderStartCalled`, …) by text-scanning user code against
`API_PATTERNS`, then `execute()` reads them to decide whether to open the output
window, start audio, or turn on the camera (`src/runtime/app.js`).

The friction an architecture review flags here is that `API_PATTERNS` is a
**second list of APIs**, disconnected from the `_registerBuiltin` calls that
actually put APIs on `window` (`src/runtime/api-registry.js`, `app.js`). Nothing
stops the two from drifting: register an API the detector never learns about, or
leave a `usesX` key whose API was renamed.

The tempting "deepening" is to make each API **self-declare** its activation —
`registerAPI('vision', impl, { match:/\bvision\b/, needs:['camera'] })` — and have
the detector loop the registry. We considered this and rejected it.

## Why a gate, not self-declaration

- **The central table is already the right shape.** Unlike the hand-maintained
  cleanup *list* ADR 008 replaced, `API_PATTERNS` is a focused, legible lookup.
  Scattering its ~14 presence-regexes across 16 modules would make the plain
  question *"what does `execute()` check before a run?"* require reading 16 files
  instead of one. That trades a real, central artifact for worse locality.
- **The deep part doesn't fit a per-API regex anyway.** The valuable logic in the
  detector is the **AST call-flow** analysis — `shaderStartCalled` /
  `shaderConstructedOnly` (was `Shader` constructed *and* `.start()` called?). That
  is genuinely deep and has no per-module regex form, so self-declaration could
  only ever move the flat presence-flags, leaving the detector intact regardless.
- **Same instinct as ADR 008 / ADR 011.** The actual problem is *silent drift*
  between two lists, not the table's shape. ADR 011 chose a coverage **gate** over
  a capability **generator** for exactly this reason; ADR 008 turned a duplicated
  list into a self-registering one. Here the low-risk, high-value move is to turn
  the prose invariant ("the detector and the registry agree") into a green/red
  check — not to re-architect a table that works.

## Design

A new test (e.g. `tests/api-detection-coherence.test.js`) asserts:

- every `API_PATTERNS` key maps to an API that is actually registered (no
  detection for a renamed/removed API);
- no registered API that triggers a run-time side effect (opens the output
  window, starts audio, enables the camera) lacks a corresponding pattern —
  or is explicitly listed as "no activation needed".

The AST call-flow checks (`shaderStartCalled`) stay in `api-detector.js`,
untouched and out of the gate's scope.

## Trade-offs

- **Coarse by design.** The gate catches table↔registry *drift*, not "this regex
  is too loose / too tight." Pattern precision stays a code-review concern.
- **Lower ceiling than self-declaration.** Activation knowledge for an API still
  lives in `api-detector.js`, not beside the API's implementation. Accepted: the
  central view is worth more than the co-location here, and the AST checks pin the
  detector in place anyway.

## Consequences

- The "detector and registry agree" invariant becomes an enforced gate, not a
  hope — the same upgrade ADR 011 made for blocks coverage.
- A future architecture review that re-spots "`API_PATTERNS` is disconnected from
  the registry" should read this ADR before proposing self-declaring APIs: the
  disconnection is closed by the gate, on purpose, and the central table is
  deliberate.
- Adding an API with a run-time side effect is a forcing function: add its
  pattern, or the gate flags it.
