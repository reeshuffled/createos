# ADR 004: Web Speech API for Voice Recognition (not Whisper)

**Status:** Decided  
**Date:** 2026-06-23

## Decision

Use the browser's built-in Web Speech API (`SpeechRecognition`) for `audio.onWord()` and `audio.onSpeech()`. Do not use Whisper (local inference via Transformers.js or a server).

## Context

The IDE needed voice input for two use cases: (1) learner sketches that react to spoken words, (2) raw transcript access. Three options were on the table:

- **Web Speech API** — browser built-in, zero setup, continuous streaming recognition
- **Transformers.js + Whisper** — runs in-browser via WebAssembly, no server, ~150 MB model download
- **Cloud STT** (Whisper API, Google Cloud Speech, etc.) — server round-trip, API key, cost

## Why Web Speech API

**Latency**: ~300–500 ms continuous recognition vs 2–5 s per utterance for Whisper local. Live coding is reactive; a 5-second gap between saying "red" and the canvas changing breaks the experience.

**Zero infrastructure**: no model download, no server, no API key. Users open the IDE and it works.

**Zero bundle cost**: Web Speech API is a browser built-in. Whisper via Transformers.js adds ~150 MB model weight + WASM runtime.

**Continuous mode**: `SpeechRecognition` with `continuous: true` streams partial results in real time. Whisper (local) processes audio in fixed chunks and blocks during inference.

## Trade-offs accepted

**Browser support**: Chrome and Edge only (as of 2026). Firefox and Safari do not implement `SpeechRecognition`. Code degrades gracefully — `_ensureRecognition()` logs a warning and returns null if the API is absent.

**Privacy**: In Chrome, audio is streamed to Google's servers for recognition. This is disclosed in the toolkit hint text. Users who need offline or private recognition should use Whisper via the raw `audio.mic()` + Tone.js path instead.

## Why not Whisper (local)

- Latency makes it unsuitable for reactive live coding
- 150 MB cold download breaks first-run UX
- WASM inference blocks the main thread without a Worker, which requires significant infrastructure
- Whisper accuracy is overkill for single-word voice commands

## Consequences

- `audio.onWord(word, fn)` and `audio.onSpeech(fn)` work in Chrome/Edge; silently no-op in other browsers
- Single `SpeechRecognition` instance per page, `continuous: true`, auto-restarts on `onend`
- Stopped and nulled on `cleanupAudio()` to prevent recognition continuing after user stops code
- Toolkit hints warn "Chrome/Edge" so users know the constraint upfront
- If Firefox/Safari ship `SpeechRecognition`, no code change needed — `_ensureRecognition()` will find it
