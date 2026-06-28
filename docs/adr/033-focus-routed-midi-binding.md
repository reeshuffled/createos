# Focus-Routed, Permission-Aware MIDI Binding

## Status

accepted

## Context

`midi.js` already wraps Web MIDI: it opens access, emits `midi:note:on` / `midi:note:off` / `midi:cc` on the bus, and offers `onNote` / `onCC` / `signal`. But nothing connects it to the two instrument widgets that obviously want it — Piano and Drumpad. Today a learner has to hand-write `midi.onNote(e => p.strike(...))`, which means knowing the MIDI note-number→note-string conversion, the drum map, the source-tag rules, and that those handlers are run-scoped. That is a lot of glue for "plug in my keyboard and play the piano."

Two hard constraints shape the design:

1. **Web MIDI has no pre-access device enumeration.** There is no `navigator.midi.getDevices()`. `requestMIDIAccess()` *is* the gate, and modern Chrome/Firefox/Safari all show a permission prompt for it (no longer sysex-only). So you cannot tell whether a controller is plugged in without prompting, and the MIDI userbase is a small minority — prompting everyone who clicks a Piano is unacceptable.
2. **Instrument widgets survive reset; run-scoped MIDI handlers do not.** `cleanupMidi()` wipes `_noteHandlers`, and bus subscriptions created during a run are cleared by `clearRunScoped()`. A binding that lives as long as the widget cannot be built on either.

## Decision

A single open Piano or Drumpad — the **MIDI Target** — receives Web MIDI input, with no editor code required. The connection is auto-wired by focus and gated on standing permission.

Specific choices and their trade-offs:

- **Routing = sticky last-focused instrument.** Focusing a Piano/Drumpad makes it the target; it stays the target when focus moves to the editor or any non-instrument window, switching only when a *different* instrument is focused. Chosen over **literal focus** (typing code would silence MIDI — kills play-while-coding) and over **all-open-widgets-respond** (note 36 is both Piano C2 and a GM kick → collisions when mixed widgets are open). Per-widget arm toggles were rejected as more clicks for the common single-instrument case.

- **Enable is permission-aware, not auto-prompt.** On focus, the instrument checks `navigator.permissions.query({ name: 'midi' })` *silently*. `granted` → open access and bind automatically (returning MIDI user, zero friction). Otherwise → show a dormant MIDI chip; only clicking it (the gesture) calls `requestMIDIAccess` and prompts. After the first grant, every later session reads `granted` and auto-binds. This is the whole point: a user with no controller is **never** prompted. Rejected **auto-open-on-first-focus** (prompts the non-MIDI majority) and **always-button** (makes granted users click every session for nothing).

- **The coordinator is a persistent bus tap, not a run-scoped subscription.** Because the binding must outlive resets (the widget does), routing is driven by `addBusTap` on `midi:note:*` (same mechanism as the Event Stream Panel) plus the existing `_pianos` / `_drumpads` registries and `wm` focus tracking — *not* `midi.onNote` or `on('midi:note:on')`, both of which are wiped on reset. This is a deliberate, documented exception to the "subsystems use the run-scoped reset pattern" norm; the tap is torn down on page unload, not on reset.

- **Per-widget translation, reusing each widget's own input path.**
  - **Piano:** MIDI note-number → note-string (60 = C4), full range. note-on = attack, note-off = release (true sustain, not the fixed-duration `strike()` replay verb). When a sequencer step is selected, MIDI note-on programs that step instead of sounding — mirroring the existing mouse behavior exactly.
  - **Drumpad:** General MIDI percussion map (36→kick, 38→snare, 42→hhc, 46→hho, 39→clap, 45→tomL, 47→tomH, 49→cym, plus common aliases 35→kick, 40→snare, 51→cym). One-shot; note-off ignored. Unmapped notes ignored. Chosen over chromatic-from-base so real e-drum kits / MPC pads work out of the box.

- **Velocity passes through.** MIDI velocity (0–1) drives synth loudness via the Tone trigger calls and appears in the `onNote` / `onHit` event payloads. Requires `_triggerAttack` / `_trigger` to accept a velocity arg; the mouse / computer-keyboard / sequencer paths keep the default `1`.

- **Capture falls out of the source tag.** MIDI input is tagged `source:'midi'` — not `'replay'` — so it records into a widget's **Take** when Capture (●) is armed, with velocity and (Piano) note duration, exactly like mouse/keyboard input. `.replay()` then reproduces a MIDI performance as code. No special-casing; this is the existing rule working as intended.

- **All channels, notes only (v1).** No per-channel filter (there is no code/UI seam for one under the no-code model) and no CC/knob mapping yet.

## Consequences

- The MIDI chip doubles as the target indicator (lit on the current target), so users can see where MIDI lands; it must update on every focus switch.
- The persistent tap means MIDI input drives the target even with no code running — consistent with the widget surviving reset, but a departure from "input does nothing until you Run."
- `permissions.query({ name: 'midi' })` support is assumed; if a browser lacks it, fall back to the dormant-chip path (treat as not-granted) so nothing auto-prompts.
- Velocity threading touches the internal trigger signatures in both widgets and the Take/replay payloads (Piano `strike` / `_applyAction`, Drumpad `_applyAction`).
