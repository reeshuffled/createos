# Live Mixer Console

## Status

accepted — supersedes the standalone EQ widget (ADR-prior `EQWidget` is removed)

## Context

The IDE could make sound from many places — Tone instruments, patterns, the mic, Drumpads, window `<video>`/HTML media — but the only mixing surface was a single standalone EQ widget you had to manually `.chain()` into one node. Everything else went straight to `Tone.getDestination()` (instruments hardcoded `.toDestination()`; window media bridged `MediaElementSource → audioCtx.destination`, with the per-window `Tone.Channel` purely decorative). There was no way to see, level, or shape *what is currently running* as a whole. We now have a pattern registry, so the runtime knows what is live.

## Decision

Add `window.mixer`: a WM console panel (+ toolbar button) that auto-discovers every live **Audio Source** and gives each one a **Strip** — a `Tone.Channel` (volume / pan / mute / additive-solo + live VU meter) inserted between the source and **Master** (`Tone.getDestination()`), with a lazily-spliced 4-band parametric EQ. All channels still feed the Master, so the existing master FFT and mute-via-destination paths keep working untouched.

Specific choices and their trade-offs:

- **Strip granularity = per live source, dynamic.** Strips appear/disappear as sources start/stop, driven off the registries. Chosen over fixed category buses (too coarse) and manual named channels (doesn't exploit the registry).
- **Bind target = Instrument, with Patterns as sub-rows ("both, layered").** The Strip is the actual audio node (`Tone.Channel`); a Pattern is a scheduler and appears as a sub-row under its Instrument's Strip. A bare `inst.play()` still gets a Strip; two patterns sharing one instrument correctly share one Strip.
- **Eager auto-strip.** The `Instrument` constructor (`audio.js`) is the choke point — every instrument is routed through its own `Tone.Channel → Master` instead of `.toDestination()`, and registered in a new run-scoped instrument registry (cleared on reset like `_patternRegistry`). `Instrument.chain()/connect()` re-target the Strip, not the destination. This changes the signal path for every existing demo; accepted because Master still sees everything.
- **Non-Tone sources are first-class.** Window media is rebridged `MediaElementSource → Tone.Channel → Master` (replacing the decorative channel); mic, Drumpad, and arbitrary raw WebAudio nodes (via an explicit `mixer.add(node)` API) all get Strips. Window-media and Drumpad Strips are window-scoped (survive reset, die on window close), unlike run-scoped instrument Strips.
- **4-band parametric EQ, lazily inserted.** Idle strips stay vol/pan/meter only; the filter chain (low-shelf + 2 peaking + high-shelf, built from `Tone.Filter`) is spliced in only when a strip's EQ is touched, to bound node count and CPU.
- **Settings persist by name.** Strip name = pattern id if given, else instrument-type+counter, window title, `mic`, or drumpad title; renamable. Settings are re-applied to the matching new source on re-run, persisted to localStorage, and travel in the `.vljson` project. **Solo is just another persisted per-strip flag** (additive): while any strip is soloed, every non-soloed source ducks — including sources that appear *after* the solo, and including on project load (UI must show a prominent solo indicator).
- **Strip is always the last node before Master (invariant).** Only the 7 Instrument types earn a strip (FX nodes never do); the strip is the instrument's permanent output tail. `inst.chain(reverb, delay)` re-targets to end at `this._strip` instead of `Tone.getDestination()`, so user FX sit *before* the strip and the mixer's vol/pan/EQ is post-FX. Instruments created but never played still show (eager). Explicit `inst.connect(customNode)` is treated as the user taking manual control and may bypass the strip.
- **The instrument registry is the strip registry.** Strips exist independent of whether the panel is open; the panel renders the registry and subscribes to add/remove. Instruments need new `instrument:created`/`instrument:disposed` events (patterns already emit `pattern:started`/`stopped`).
- **Arbitrary nodes via `mixer.add(node, {name})`** → returns the Strip; mixer owns the inserted `Tone.Channel` (disposed on reset/removal), user owns the raw node's lifecycle. Run-scoped by default.
- **Orphan strips (saved name, no live source) are kept and shown greyed with a manual ✕.** Settings persist indefinitely so a re-run that re-creates the source instantly re-applies the mix — chosen over auto-prune-on-save, which would silently lose a mix between the constant reset/re-run cycles.
- **Standalone EQ widget removed entirely.** `EQWidget` class, `audio.eqWidget()`, its toolbar button, WM restorer, blocks, and completions are deleted; the Master strip takes over the global-EQ role. The old `__ar_widgetRestorers['eq']` becomes a graceful no-op so legacy projects load.
- **Blocks coverage = core setters only.** `mixer.strip(name).volume()/pan()/mute()` get blocks so basic live mixing survives a text↔blocks switch; EQ and meter are UI/text-only.

## Consequences

- Every instrument now carries an extra `Tone.Channel` node — slightly more nodes per run, and the instrument registry/strip teardown joins the reset path.
- Re-patching a playing source when EQ is inserted, or when window media is rebridged, can click/pop — needs a short ramp/disconnect-reconnect guard.
- Auto-name drift is a known wart: removing an instrument from code orphans its persisted strip settings.
