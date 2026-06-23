# CONTEXT.md — Visual Live Coding IDE

## Glossary

### Editor Instance
A self-contained authoring unit. Comprises an **Editor Window** and a paired **Output Window**. Created together via the "+" toolbar button, closed together via confirmation. Identified by a stable numeric ID (1, 2, 3…).

### Editor Window
The floating window that holds the code area (text or blocks), mode toggle, play/pause/stop controls, and embedded console. Each Editor Window belongs to exactly one Editor Instance. Cannot be closed without confirmation; can be minimized to the Taskbar.

### Output Window
The canvas display window paired with an Editor Instance. Renders only the visual output of its paired editor's running code. Can be closed independently (no effect on the Editor Window or running code). Automatically spawned when an Editor Instance is created.

### Embedded Console
A collapsible log panel inside the Editor Window. Receives `console.log`/`console.error` output only from that Editor Instance's running code. Can be "popped off" into an independent floating window that remains connected to the same editor's output stream.

### Taskbar
A dock bar that appears at the bottom of the desktop when at least one Editor Window is minimized. Each minimized editor is represented as a chip showing its title and run-state indicator. Disappears when no editors are minimized.

### Minimized Editor
An Editor Instance whose Editor Window has been collapsed to the Taskbar. Code and execution state are preserved. Restored by clicking the chip in the Taskbar.

### Run State
The execution state of a single Editor Instance: `idle`, `running`, `paused`, or `stopped`. Independent per instance — pausing Editor 2 has no effect on Editor 1.

### Shared Globals
APIs that live on `window` and are accessible from all Editor Instances simultaneously: `Shader`, `ShaderFX`, `audio`, `vision`, `Camera`, `Media`, `wm`, `Color`, `onKey`, `randUni`. A shader created in Editor 1 can be referenced in Editor 2.

### Per-Editor Locals
APIs injected as locals into each Editor Instance's IIFE at execution time, scoping them to that instance's canvas stack: `draw`, `getCanvas`, `getLayer`, `setInterval`, `clearInterval`, `setTimeout`, `clearTimeout`. These shadow any global with the same name inside the user's IIFE.

### IIFE Isolation
The execution strategy used to scope per-editor APIs. Each editor's `execute()` injects **Per-Editor Locals** as named variables in the IIFE wrapper before user code runs. Callbacks and timers capture these locals via closure. Globals (`Shared Globals`) remain on `window` and are unaffected.

### Editor Persistence
Each Editor Instance saves its code to `localStorage` under key `vl-ide-code-{id}`. A manifest key `vl-ide-editors` holds the ordered list of active editor IDs. On page load all editors in the manifest are recreated with their saved code.
