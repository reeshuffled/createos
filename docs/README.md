# Visual Live Coding IDE — Docs

Press **?** in the IDE for the in-app audio quick reference.

## APIs

| Doc | What it covers |
|-----|---------------|
| [audio.md](audio.md) | Synths, effects, patterns, scales, microphone, audio→visual |
| [shader.md](shader.md) | WebGPU/WGSL fragment shaders (Chrome/Edge/Safari 18+) |
| [glsl-shader.md](glsl-shader.md) | WebGL/GLSL fragment shaders — all browsers, ShaderToy paste-in |
| [pixi.md](pixi.md) | PIXI.js — sprites, scene graph, particles, filters, hit-testing |
| [canvas.md](canvas.md) | Canvas 2D drawing, layers, CSS effects |
| [media.md](media.md) | Images, video layers |
| [vision.md](vision.md) | Object detection, gesture, face expression |
| [video.md](video.md) | Sample canvas/camera regions as live brightness/color/motion signals |
| [sensors.md](sensors.md) | Mouse, keyboard, gamepad, device motion, geolocation, network, battery signals |
| [control.md](control.md) | Timers, keyboard, color, utilities |
| [windows.md](windows.md) | Spawn, tile, show/hide, move/resize IDE windows from code |
| [desktop.md](desktop.md) | Desktop file icon management |

## Z-order

`draw.at(z)` / `getCanvas(z)` take a logical z, mapped to CSS z-index as `20 + z` (negative stays negative). Media and Shader use CSS z-index directly.

| Logical z | CSS z-index | Contents |
|-----------|-------------|----------|
| negative  | negative    | Behind camera feed |
| 0         | 20          | Main canvas — `draw`, `getCanvas(0)` |
| 1–4       | 21–24       | Safe range for additional user layers |
| 5+        | 25+         | Overlaps Media (CSS 25) and Shader (CSS 30) defaults |
| —         | 25          | Media default (`Media.image`, `Media.video`) · PIXI canvas (`window.pixi`) |
| —         | 30          | Shader default (`new Shader(...)`) · GLShader default (`new GLShader(...)`) |

## Global Functions

```js
draw               // Fluent 2D drawing API — draw.rect/circle/text/line/etc (see canvas.md)
getCanvas(z?)      // HTMLCanvasElement at logical z (default 0)
getLayer(z?)       // Layer object with CSS effects API
pat(str, synth)    // Create audio pattern (mini-notation)
stack(p1, p2, …)  // Layer multiple patterns
onKey(key, fn)     // Keyboard handler
randUni(lo, hi)    // Random float in range
Color.random()     // Random vivid HSL color string
Color.invert(str)  // Invert a CSS color string
stop()             // Stop execution
pause()            // Pause timers
resume()           // Resume timers
wm.show/hide/toggle/focus/maximize/restore(id)  // control IDE windows (see windows.md)
wm.move(id, x, y) / wm.resize(id, w, h)        // position windows in px
wm.layout(name)                                 // switch tiling layout
wm.spawn(title, opts)                           // create floating window → id
wm.pickFile(key)                                // file picker → blob URL (async, cached by key)
wm.list()                                       // list all window ids
video.signal(source, opts?)                     // live brightness/r/g/b/motion/hue from canvas or camera (see video.md)
video.onMotion(src, threshold, onEnter, onExit?)  // edge-trigger on motion
video.onBrightness(src, threshold, onEnter, onExit?)  // edge-trigger on brightness
sensors.mouse()     // live x/y/buttons + .onMove/.onButton (see sensors.md)
sensors.keyboard()  // live held keys + .onKey
sensors.gamepad()   // axis/button/pressed + .onButton/.onAxis
sensors.motion()    // device accelerometer/gyro + .onShake/.onTilt
sensors.geo()       // geolocation lat/lon/speed/heading
sensors.network()   // online/type/downlink + .onChange
sensors.battery()   // async → level/charging + .onChange
desktop.add(url, opts?)   // add file icon to desktop (see desktop.md)
desktop.files()           // list all file icons
desktop.onFile(fn)        // callback when user opens a file icon
pixi                      // PIXI.Application — scene graph renderer (see pixi.md)
Stage                     // pixi.stage shorthand — Stage.addChild(sprite)
PIXI                      // PIXI namespace — Sprite, Graphics, Text, TextStyle, Container, filters.*
pixi.tick(fn)             // tracked animation callback — cleaned up on Stop
GLShader                  // WebGL/GLSL shader — works in all browsers (see glsl-shader.md)
GLSL_PRESETS              // { gradient, plasma, waves, circles, noise } fragment body strings
```
