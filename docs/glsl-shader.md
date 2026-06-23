# GLShader API

WebGL/GLSL fragment shaders. Works in **all browsers** — Chrome, Firefox, Safari, mobile.

Use `GLShader` when:
- You need Firefox or older Safari support (`Shader` requires WebGPU)
- You're pasting code from ShaderToy
- An LLM generated GLSL (agents write GLSL more fluently than WGSL — larger training corpus)
- You want `GLShader` + `PIXI` on the same WebGL context

Use `Shader` (WebGPU) instead when:
- You need compute shaders or storage buffers
- Chrome/Edge/Safari 18+ is guaranteed
- You want JS arrow function → auto-compiled WGSL

Both share the same `.start()/.stop()/.set()/.bind()/.opacity()/.z()` API.

---

## Quick Start

```js
// Write the fragment body — uv, time, mouse, custom pre-declared
// Set gl_FragColor to output color
const s = new GLShader(`
  float r = sin(uv.x * 10.0 + uTime) * 0.5 + 0.5;
  float g = cos(uv.y * 8.0  - uTime) * 0.5 + 0.5;
  gl_FragColor = vec4(r, g, 0.5, 1.0);
`);
s.start();
```

Pre-declared variables:

| Variable | Type | Value |
|----------|------|-------|
| `uv` | `vec2` | Normalized 0–1 position |
| `time` | `float` | Alias for `uTime` — seconds since start |
| `mouse` | `vec2` | Alias for `uMouse` — normalized 0–1 |
| `custom` | `vec4` | Alias for `uCustom` — user-controlled |
| `uResolution` | `vec2` | Canvas resolution in pixels |
| `uTime` | `float` | Seconds since `.start()` |
| `uMouse` | `vec2` | Mouse position normalized 0–1 |
| `uCustom` | `vec4` | User-controlled uniform |

---

## API

```js
new GLShader(fragmentBody, { z: 30, opacity: 1.0, video: null })
```

| Method | Description |
|--------|-------------|
| `s.start()` | Begin render loop |
| `s.stop()` | Pause render loop |
| `s.set([r, g, b, a])` | Set all four `uCustom` channels |
| `s.set(index, value)` | Set one channel: `0=x 1=y 2=z 3=w` |
| `s.video(source)` | Set video/canvas source (`uVideo` sampler2D) |
| `s.bind(signal)` | Auto-fill `uCustom = [rms, bass, mid, high]` from audio signal |
| `s.opacity(0–1)` | Layer opacity |
| `s.z(n)` | CSS z-index (default 30) |

---

## Source Detection

GLShader automatically detects the type of source you pass and wraps accordingly:

| Source contains | Mode | Behaviour |
|----------------|------|-----------|
| `void main()` or `#version` | Full GLSL | Used as-is — you declare all uniforms |
| `void mainImage(out vec4, in vec2)` | ShaderToy | Wrapped — `main()` calls `mainImage(gl_FragColor, gl_FragCoord.xy)` |
| Anything else | Fragment body | Wrapped with uniform declarations, `uv/time/mouse/custom` bindings, `void main()` |

---

## Presets

```js
// GLSL_PRESETS: gradient, plasma, waves, circles, noise
const s = new GLShader(GLSL_PRESETS.plasma);
s.start();
```

Same visual presets as `SHADER_PRESETS` but GLSL/WebGL.

---

## ShaderToy Paste-In

ShaderToy shaders paste in with zero changes:

```js
new GLShader(`
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / uResolution;
  vec3 col = 0.5 + 0.5 * cos(uTime + uv.xyx + vec3(0,2,4));
  fragColor = vec4(col, 1.0);
}
`).start();
```

`uResolution` and `uTime` match ShaderToy's `iResolution.xy` and `iTime` in concept. Rename the uniforms or alias them for exact compat:

```js
new GLShader(`
  // ShaderToy compat aliases
  #define iTime uTime
  #define iResolution vec3(uResolution, 1.0)

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // paste ShaderToy code unchanged
}
`).start();
```

---

## Examples

### Plasma

```js
new GLShader(`
  float r = sin(uv.x * 6.28 + uTime) * 0.5 + 0.5;
  float g = sin(uv.y * 6.28 + uTime * 1.3) * 0.5 + 0.5;
  float b = sin((uv.x + uv.y) * 6.28 + uTime * 0.7) * 0.5 + 0.5;
  gl_FragColor = vec4(r, g, b, 1.0);
`).start();
```

### Mouse-reactive ring

```js
new GLShader(`
  float d = distance(uv, mouse);
  float ring = smoothstep(0.02, 0.0, abs(d - 0.15));
  gl_FragColor = vec4(ring, ring * 0.5, 0.0, ring);
`).start();
```

### Audio-reactive — bind signal

```js
const sig = audio.signal(audio.master);
audio.start();

const s = new GLShader(`
  float level = custom.x;  // rms
  float d = distance(uv, vec2(0.5));
  float glow = exp(-d * (5.0 + level * 20.0));
  gl_FragColor = vec4(glow, glow * 0.4, glow * 0.1, glow);
`);
s.bind(sig);  // fills custom = [rms, bass, mid, high] each frame
s.start();
```

### Custom uniform

```js
const s = new GLShader(`
  float speed = custom.x;
  float r = sin(uv.x * 6.28 + uTime * speed) * 0.5 + 0.5;
  gl_FragColor = vec4(r, custom.y, custom.z, 1.0);
`);
s.set([2.0, 0.3, 0.8, 0.0]);  // speed=2, g=0.3, b=0.8
s.start();
```

### Video / camera input

`uVideo` sampler2D auto-declared when `{ video: source }` is set. `col` pre-assigned in fragment body mode:

```js
const cam = new Camera();
await cam.open();

new GLShader(`
  vec4 col = texture2D(uVideo, uv);
  float grey = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  gl_FragColor = vec4(grey, grey * 0.8, grey * 0.6, 1.0);
`, { video: cam }).start();
```

Accepted video sources: `Camera` instance, `HTMLVideoElement`, `HTMLCanvasElement`.

### Full GLSL program

If `void main()` is present, the source is used as-is. Declare your own uniforms:

```js
new GLShader(`
precision highp float;
uniform float uTime;

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(1600.0, 900.0);
  gl_FragColor = vec4(uv, sin(uTime) * 0.5 + 0.5, 1.0);
}
`).start();
```

### GLShader + PIXI

```js
// GLShader full-screen background (WebGL, z=30)
new GLShader(GLSL_PRESETS.plasma).start();

// PIXI text on top (WebGL, z=25 — composited below shader z=30)
const t = new PIXI.Text('GLSL + PIXI', new PIXI.TextStyle({
  fontSize: 64, fill: '#fff', fontWeight: 'bold',
  dropShadow: true, dropShadowDistance: 6,
}));
t.anchor.set(0.5);
t.x = pixi.screen.width / 2;
t.y = pixi.screen.height / 2;
Stage.addChild(t);
pixi.tick(() => { t.rotation = Math.sin(pixi.ticker.lastTime / 1000) * 0.2; });
```

---

## Notes

- Cleaned up automatically on Stop/Reset — no manual cleanup needed
- WebGL requires a secure context (localhost or HTTPS)
- z-index default 30 (same as `Shader`) — place below PIXI (z=25) by setting `z: 20`
- Firefox: WebGL only — `Shader` (WebGPU) will throw; `GLShader` works
