# Visual Live Coding IDE

A live coding environment for creating audiovisual experiences in the browser — shaders, synthesizers, video, and computer vision, all from a single JavaScript editor.

## What you can make

- **GPU shaders** — full-screen WebGPU/WGSL fragment shaders with `time`, `uv`, `mouse`, and custom uniforms
- **Audio synthesis** — synths, sequencers, effects chains via [Tone.js](https://tonejs.github.io/)
- **Media layers** — image and video overlaid on the canvas with z-ordering
- **Camera + vision** — react to hand gestures, facial expressions, and detected objects via [MediaPipe](https://github.com/google-ai-edge/mediapipe)
- **2D canvas** — draw on z-indexed layers with CSS filter effects (blur, hue, brightness, etc.)
- **Window management** — spawn floating windows (image, video, camera, canvas, shader, HTML), browse local directories, move/resize/maximize from code (`wm.spawn`, `wm.browse`, `wm.layout`, etc.)

## Editor features

- [CodeMirror 5](https://codemirror.net/5/) with syntax highlighting, bracket matching, code folding, and inline widgets
  - **Color swatches** — click any color string to open an HSL picker; edits write back to the source
  - **Number scrubbers** — drag any numeric literal to change its value live
- **Blocks panel** (toggle on/off) — visual [Blockly](https://developers.google.com/blockly) workspace for Audio, Shader, Vision, Canvas, and Media blocks; coexists with the text editor
- **API drawer** (toggle on/off) — drag-to-text code snippets for every API
- Infinite loop protection ([Esprima](https://esprima.org/))
- Friendly runtime error messages
- Pause / Resume program execution

## APIs available in user code

```js
// Audio
const s = audio.synth();
s.play('C4', '8n');
audio.bpm(120);
audio.start();

// Shaders
const shader = new Shader(`
  let col = vec3f(uv.x, uv.y, sin(time) * 0.5 + 0.5);
  return vec4f(col, 1.0);
`);
shader.start();

// Post-process shader FX
const fx = new ShaderFX('blur');
fx.start();

// Camera streams
const cam = new Camera();
const stream = await cam.open(); // CameraStream — stream.element is a <video>

// Media
const vid = Media.video('https://example.com/clip.mp4');
vid.play();

// Vision
vision.onGesture('Thumb_Up', () => { /* ... */ });
const face = vision.face(); // { expression, cx, cy, landmarks }

// 2D draw API (layer 0)
draw.bg('#000').circle(400, 300, 50, 'red').text('hi', 100, 100);

// Raw canvas layers
const ctx = getCanvas(0).getContext('2d');
ctx.fillStyle = 'red';
ctx.fillRect(0, 0, 100, 100);
getLayer(0).blur(5);

// Capture a DOM element to canvas (usable as shader video input)
const cap = captureWindow(document.getElementById('win-editor'), 12);

// Window management
wm.spawn('Info', { type: 'html', html: '<h2>hello</h2>', w: 320, h: 240 });
wm.spawn('Photo', { type: 'image', src: url, w: 480, h: 360 });
wm.spawn('Clip',  { type: 'video', src: url, w: 640, h: 480, controls: true });
wm.spawn('Cam',   { type: 'camera', w: 320, h: 240 });
wm.spawn('Layer', { type: 'canvas', z: 0, w: 640, h: 480 });
wm.spawn('FX',    { type: 'shader', shader: s, w: 640, h: 480 });

// All spawn opts: x, y, w, h, id (+ type-specific)

// File picker — returns blob URL; caches handle by key (no re-prompt)
const url = await wm.pickFile('myPhoto');

// Directory browser — spawns a file-tree window; click file → callback
await wm.browse('assets', (url, name) => {
  wm.spawn(name, { type: 'image', src: url });
});

// Window control
wm.show('win-canvas');   wm.hide('win-canvas');   wm.toggle('win-console');
wm.focus('win-editor');  wm.close(id);
wm.move(id, 200, 100);   wm.resize(id, 640, 480);
wm.maximize(id);          wm.restore(id);
wm.layout('split');       // built-in layout
console.log(wm.list());   // all window ids

// Per-window audio routing (mute/volume controls in titlebar affect this channel)
synth.connect(wm.channel(id));
```

## Tech stack

- **Vite** — build tooling
- **CodeMirror 5** — editor
- **Blockly** — visual block coding
- **Tone.js** — audio synthesis and sequencing
- **WebGPU + WGSL** — GPU fragment shaders
- **MediaPipe Tasks Vision** — gesture, face, and object detection
- **Esprima** — infinite loop detection

## Dev

```sh
npm install --legacy-peer-deps
npm run dev                               # dev server
node node_modules/vite/bin/vite.js build  # production build
npm test                                  # run all tests
```
