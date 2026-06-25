# ADR 011: A Blocks-Coverage Gate (not a capability-generator)

**Status:** Decided
**Date:** 2026-06-25

## Decision

Add a build-time test (`tests/blocks-coverage.test.js`) that asserts every
learner-reachable toolkit capability area has a blocks path — or is explicitly
classified as intentionally text-only. Do **not** build a single
capability-descriptor that generates toolkit entries, blocks, and docs.

## Context

CLAUDE.md's stated #1 failure mode: *"capabilities that exist in text with NO
blocks path at all — that's what causes data loss on mode switch."* This was
enforced only by prose. The toolkit drawer (`TOOLKIT_CATEGORIES` in
`completions.js`) and the Blockly toolbox (`TOOLBOX` in `blocks.js`) are two
independent hand-maintained lists, so a new text capability with no block could
ship unnoticed.

## Why a gate, not a generator

ADR 002 establishes that text↔blocks is a lossy decompilation problem, and the
project rule is **"functional coverage, not syntactic mirroring"** — a block may
be shaped completely differently from its text form, and one block can stand for
many text forms. So a unified descriptor that *generates* both is the wrong
tool: it would force syntactic mirroring ADR 002 explicitly rejects, and it
touches the two largest files. The valuable, low-risk core is just the
**coverage check** — turning the prose rule into an enumerated, enforced
classification.

## Design

The gate works at the **capability-area** altitude (toolkit category), not
per-method — matching ADR 002's "functional coverage." Each toolkit category is
exactly one of:

- **COVERAGE** — mapped to block-type prefixes; the test asserts ≥1 such block
  is reachable from the toolbox. (This map is a lightweight "capability
  descriptor" — the index of truth that ties a text area to its block area.)
- **TEXT_ONLY_INTENTIONAL** — deliberately no blocks path (advanced / hardware /
  niche desktop-shell): each entry is the conscious "text-only on purpose"
  decision the functional-coverage rule needs recorded.
- **BLOCKS_TODO** — a known gap, learner-facing, no blocks yet. Keeps the
  backlog visible while the gate stays green; entries move to COVERAGE as blocks
  land (a self-cleaning check flags TODO items that gain blocks).

A new toolkit category in none of the three fails the test, forcing a conscious
classification. A COVERAGE entry whose blocks were renamed/removed also fails
(coverage can't silently rot).

## Trade-offs

- **Coarse by design.** The gate catches "capability area with no blocks path"
  (the stated failure mode), not "method X within a covered area lacks a block."
  Per-method matching is intractable under ADR 002 and is deliberately out of
  scope.
- Current backlog surfaced: `Sensors` and `Haptics` are learner-facing areas
  with no blocks today (BLOCKS_TODO). Several advanced areas (MIDI, External
  Data, Desktop Shell, Plugin iframes, Window Physics, Status Bar, Desktop) are
  classified TEXT_ONLY_INTENTIONAL.

## Consequences

- CLAUDE.md's "every learner-reachable capability needs a blocks expression"
  rule is now a green/red gate, not a hope.
- Adding a new toolkit category is a forcing function: cover it with blocks, or
  consciously file it as intentional-text-only / TODO.
