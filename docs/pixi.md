# PIXI API

PIXI.js v7 — WebGL scene graph for sprites, containers, particles, text, and per-object filters.

Use PIXI when:
- You need sprites, textures, or sprite sheets
- You need per-object hit-testing / pointer events
- You need particle systems (10k+ objects efficiently)
- You need rich text rendering with shadows, stroke, gradient
- You need per-object filters (blur, color matrix, displacement)
- You're building game-like or interactive scenes with retained objects

Use `draw` instead when:
- You're doing immediate-mode drawing (shapes every frame, no retained objects)
- You want simple geometry in a `setInterval` loop

Both coexist: draw (z=0) renders below PIXI (z=25) which renders below Shader (z=30).

---

## Globals

| Global | Value |
|--------|-------|
| `pixi` | `PIXI.Application` — the running instance |
| `Stage` | `pixi.stage` — root container, shorthand for `addChild` target |
| `PIXI` | PIXI namespace — `Sprite`, `Graphics`, `Text`, `Container`, `filters.*` |

---

## Quick Start

```js
// Create a bouncing ball
const ball = new PIXI.Graphics();
ball.beginFill(0x4488ff);
ball.drawCircle(0, 0, 50);
ball.endFill();
ball.x = pixi.screen.width  / 2;
ball.y = pixi.screen.height / 2;
Stage.addChild(ball);

let vx = 4, vy = 3;
pixi.tick(() => {
  ball.x += vx;
  ball.y += vy;
  if (ball.x < 0 || ball.x > pixi.screen.width)  vx *= -1;
  if (ball.y < 0 || ball.y > pixi.screen.height) vy *= -1;
});
```

---

## Animation — `pixi.tick(fn)`

```js
pixi.tick(delta => {
  sprite.rotation += 0.01 * delta;  // delta = elapsed frames (usually ~1)
});
```

`pixi.tick(fn)` is the preferred way to add animation callbacks. It's tracked internally and removed on Stop/Reset. `pixi.ticker.add(fn)` works but is **not** cleaned up automatically.

---

## Graphics

```js
const g = new PIXI.Graphics();

// Filled shapes
g.beginFill(0xff6600);           // hex color
g.drawRect(0, 0, 200, 100);
g.drawCircle(0, 0, 60);
g.drawRoundedRect(0, 0, 200, 100, 15);
g.drawEllipse(0, 0, 100, 60);
g.drawPolygon([0,0, 100,0, 50,100]);
g.endFill();

// Stroked lines
g.lineStyle(4, 0xffffff, 1);    // thickness, color, alpha
g.moveTo(0, 0);
g.lineTo(200, 200);
g.drawCircle(0, 0, 80);         // stroke only when beginFill not active

// Position, scale, rotation
g.x = 400; g.y = 225;
g.rotation = Math.PI / 4;       // radians
g.scale.set(1.5);               // or scale.x / scale.y
g.alpha = 0.8;

Stage.addChild(g);
```

---

## Sprites

```js
// From URL (async load — appears when texture is ready)
const sprite = PIXI.Sprite.from('https://example.com/hero.png');
sprite.anchor.set(0.5);         // origin at center (default is top-left)
sprite.x = pixi.screen.width  / 2;
sprite.y = pixi.screen.height / 2;
sprite.width  = 200;
sprite.height = 200;
Stage.addChild(sprite);

// From loaded texture (await for reliability)
const texture = await PIXI.Assets.load('https://example.com/hero.png');
const sprite2 = new PIXI.Sprite(texture);
Stage.addChild(sprite2);
```

---

## Text

```js
const style = new PIXI.TextStyle({
  fontFamily: 'Arial',
  fontSize: 48,
  fill: '#ffffff',
  fontWeight: 'bold',
  stroke: '#000000',
  strokeThickness: 4,
  dropShadow: true,
  dropShadowDistance: 6,
  dropShadowColor: '#000',
  align: 'center',
});

const label = new PIXI.Text('hello', style);
label.anchor.set(0.5);
label.x = pixi.screen.width  / 2;
label.y = pixi.screen.height / 2;
Stage.addChild(label);

// Update text
label.text = 'world';
```

---

## Container (groups)

```js
const group = new PIXI.Container();

for (let i = 0; i < 8; i++) {
  const dot = new PIXI.Graphics();
  dot.beginFill(0x4488ff);
  dot.drawCircle(Math.cos(i / 8 * Math.PI * 2) * 100,
                 Math.sin(i / 8 * Math.PI * 2) * 100, 16);
  dot.endFill();
  group.addChild(dot);
}

group.x = pixi.screen.width  / 2;
group.y = pixi.screen.height / 2;
Stage.addChild(group);

// Rotate entire group as one
pixi.tick(() => { group.rotation += 0.01; });
```

---

## Filters

```js
// Blur
const blur = new PIXI.filters.BlurFilter();
blur.blur = 12;
sprite.filters = [blur];

// ColorMatrix (greyscale, sepia, brightness, etc.)
const cm = new PIXI.filters.ColorMatrixFilter();
cm.greyscale(0.8);
sprite.filters = [cm];

// Multiple filters
sprite.filters = [blur, cm];

// Clear filters
sprite.filters = null;
```

---

## Hit Testing / Pointer Events

```js
const btn = new PIXI.Graphics();
btn.beginFill(0x4488ff);
btn.drawRoundedRect(0, 0, 200, 60, 12);
btn.endFill();
btn.x = 100; btn.y = 100;
btn.interactive = true;
btn.cursor = 'pointer';

btn.on('pointerdown', () => draw.bg(Color.random()));
btn.on('pointerover', () => { btn.alpha = 0.8; });
btn.on('pointerout',  () => { btn.alpha = 1.0; });

Stage.addChild(btn);
```

Events: `pointerdown`, `pointerup`, `pointermove`, `pointerover`, `pointerout`, `click`, `tap`.

---

## Particles

```js
const particles = new PIXI.Container();
Stage.addChild(particles);

function burst(x, y) {
  for (let i = 0; i < 30; i++) {
    const p = new PIXI.Graphics();
    p.beginFill(Math.random() * 0xffffff);
    p.drawCircle(0, 0, 3 + Math.random() * 8);
    p.endFill();
    p.x = x;  p.y = y;
    p.vx = (Math.random() - 0.5) * 14;
    p.vy = (Math.random() - 0.5) * 14;
    p.life = 1.0;
    particles.addChild(p);
  }
}

document.addEventListener('click', e => burst(e.clientX, e.clientY));

pixi.tick(delta => {
  for (let i = particles.children.length - 1; i >= 0; i--) {
    const p = particles.children[i];
    p.x  += p.vx * delta;
    p.y  += p.vy * delta;
    p.vy += 0.4 * delta;  // gravity
    p.life -= 0.02 * delta;
    p.alpha = p.life;
    if (p.life <= 0) particles.removeChildAt(i);
  }
});
```

For 10k+ objects use `PIXI.ParticleContainer` instead of `Container` — strips most features for speed.

---

## Audio-Reactive

```js
const g = new PIXI.Graphics();
g.x = pixi.screen.width  / 2;
g.y = pixi.screen.height / 2;
Stage.addChild(g);

const sig = audio.signal(audio.master);
audio.start();

pixi.tick(() => {
  const level = sig.value;   // 0–1 RMS
  const bass  = sig.bass;
  g.clear();
  g.beginFill(0x4488ff, 0.8);
  g.drawCircle(0, 0, 30 + level * 180);
  g.endFill();
  g.rotation += bass * 0.1;
});
```

---

## PIXI + WebGPU Shader Layer

PIXI (z=25) renders below `Shader` (z=30). Combine a scene-graph foreground with a fullscreen GPU background:

```js
// WebGPU shader fullscreen background (z=30)
new Shader(`
  let d = length(uv - vec2f(0.5));
  let glow = pow(max(0.0, 0.4 - d), 3.0) * 6.0;
  return vec4f(0.1, 0.3, 1.0, glow);
`).start();

// PIXI sprites rotate in front (z=25)
const group = new PIXI.Container();
group.x = pixi.screen.width  / 2;
group.y = pixi.screen.height / 2;
for (let i = 0; i < 6; i++) {
  const s = new PIXI.Graphics();
  s.beginFill(0xffffff, 0.9);
  s.drawCircle(Math.cos(i / 6 * Math.PI * 2) * 150,
               Math.sin(i / 6 * Math.PI * 2) * 150, 24);
  s.endFill();
  group.addChild(s);
}
Stage.addChild(group);
pixi.tick(() => { group.rotation += 0.008; });
```

---

## Useful Properties

```js
pixi.screen.width   // current canvas width  (responsive)
pixi.screen.height  // current canvas height
pixi.ticker.deltaTime    // elapsed time multiplier (~1 at 60fps)
pixi.ticker.lastTime     // timestamp ms
pixi.ticker.FPS          // current frames per second

// Display object common properties
obj.x / obj.y
obj.width / obj.height
obj.rotation        // radians
obj.alpha           // 0–1
obj.scale.set(x, y) // or scale.x / scale.y
obj.pivot.set(x, y) // rotation/scale origin
obj.visible         // bool
obj.zIndex          // local sort order within parent
```

---

## Notes

- `pixi.tick(fn)` callbacks are cleaned up on Stop. `pixi.ticker.add()` is not — use `tick()` in user code.
- `Stage.removeChildren()` — clear scene manually. Stage is auto-cleared on Stop.
- PIXI canvas is transparent. Draw (z=0) is visible behind it; Shader (z=30) overlays in front.
- `interactive = true` also propagates pointer events through the PIXI canvas to the page below.
- PIXI v7 uses legacy WebGL renderer by default. All major browsers support it including Firefox.
