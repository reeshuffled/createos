import * as Tone from "tone";
import { Shader } from "./shader.js";

const _vizs = [];

export function cleanupViz() {
  for (const v of _vizs) v._destroy();
  _vizs.length = 0;
}

// ── JS → WGSL conversion helpers ─────────────────────────────────────────────

function convertExpr(expr) {
  return expr
    .replace(/Math\.sin\b/g, "sin")
    .replace(/Math\.cos\b/g, "cos")
    .replace(/Math\.tan\b/g, "tan")
    .replace(/Math\.abs\b/g, "abs")
    .replace(/Math\.sqrt\b/g, "sqrt")
    .replace(/Math\.min\b/g, "min")
    .replace(/Math\.max\b/g, "max")
    .replace(/Math\.floor\b/g, "floor")
    .replace(/Math\.ceil\b/g, "ceil")
    .replace(/Math\.pow\b/g, "pow")
    .replace(/Math\.fract\b/g, "fract")
    .replace(/Math\.log\b/g, "log")
    .replace(/Math\.PI\b/g, "3.14159265")
    .replace(/Math\.E\b/g, "2.71828183")
    // bare integer literals → float (not when already followed by '.')
    .replace(/\b(\d+)\b/g, (m, _, offset, str) => str[offset + m.length] === "." ? m : m + ".0");
}

function splitArgs(str) {
  const args = [];
  let depth = 0, start = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) { args.push(str.slice(start, i).trim()); start = i + 1; }
  }
  if (start < str.length) args.push(str.slice(start).trim());
  return args;
}

function convertBlock(block) {
  return block.split(/\n|;/).map(s => s.trim()).filter(Boolean).map(stmt => {
    const decl = stmt.match(/^(?:const|let)\s+(\w+)\s*=\s*(.+)$/);
    if (decl) return `let ${decl[1]} = ${convertExpr(decl[2])};`;
    const ret = stmt.match(/^return\s*\[(.+)\]$/s);
    if (ret) return `return vec4f(${splitArgs(ret[1]).map(a => convertExpr(a.trim())).join(", ")});`;
    return convertExpr(stmt);
  }).join("\n  ");
}

function fnToWGSL(fn) {
  const src = fn.toString().trim();
  const m = src.match(/^(?:\(([^)]*)\)|([a-zA-Z_$][\w$]*))\s*=>\s*([\s\S]+)$/);
  if (!m) throw new Error("viz.shader() expects an arrow function like (v) => [r, g, b, a]");

  const params = (m[1] !== undefined ? m[1] : m[2]).split(",").map(s => s.trim()).filter(Boolean);
  const p0 = params[0] || "v";
  const p1 = params[1];

  let rawBody = m[3].trim();
  // Strip outer parens wrapping an array: (([...]))
  while (rawBody.startsWith("(") && rawBody.endsWith(")")) rawBody = rawBody.slice(1, -1).trim();

  const preamble = [
    "let col = textureSample(video, videoSampler, uv);",
    `let ${p0}: f32 = col.r;`,
    ...(p1 ? [`let ${p1}: f32 = time;`] : []),
  ];

  let body;
  if (!rawBody.startsWith("{")) {
    const arrMatch = rawBody.match(/^\[(.+)\]$/s);
    if (!arrMatch) throw new Error("viz.shader() arrow body must be an array [r, g, b, a] or a block { ... }");
    body = `return vec4f(${splitArgs(arrMatch[1]).map(a => convertExpr(a.trim())).join(", ")});`;
  } else {
    body = convertBlock(rawBody.slice(1, rawBody.lastIndexOf("}")).trim());
  }

  return preamble.join("\n  ") + "\n  " + body;
}

// ── Viz shader presets ────────────────────────────────────────────────────────

const VIZ_SHADER_PRESETS = {
  thermal:
    "let col = textureSample(video, videoSampler, uv);\n" +
    "  let v = col.r;\n" +
    "  return vec4f(v * 1.5, v * v, 0.0, 1.0);",
  cool:
    "let col = textureSample(video, videoSampler, uv);\n" +
    "  let v = col.r;\n" +
    "  return vec4f(0.0, v * 0.6, v, 1.0);",
  rainbow:
    "let col = textureSample(video, videoSampler, uv);\n" +
    "  let v = col.r;\n" +
    "  let h = v * 6.0;\n" +
    "  let r = clamp(abs(h - 3.0) - 1.0, 0.0, 1.0);\n" +
    "  let g = clamp(2.0 - abs(h - 2.0), 0.0, 1.0);\n" +
    "  let b = clamp(2.0 - abs(h - 4.0), 0.0, 1.0);\n" +
    "  return vec4f(r * v, g * v, b * v, 1.0);",
  mono:
    "let col = textureSample(video, videoSampler, uv);\n" +
    "  let v = col.r;\n" +
    "  return vec4f(v, v, v, 1.0);",
  neon:
    "let col = textureSample(video, videoSampler, uv);\n" +
    "  let v = col.r;\n" +
    "  let t2 = time * 0.5;\n" +
    "  return vec4f(v * abs(sin(t2)), v * abs(sin(t2 + 2.09)), v * abs(sin(t2 + 4.19)), 1.0);",
};

// ── AudioViz ─────────────────────────────────────────────────────────────────

export class AudioViz {
  constructor(source, { mode = "bars", bins = 64, z = 5, opacity = 0.9, color = null } = {}) {
    this._mode = mode;
    this._z = z;
    this._opacity = opacity;
    this._color = color;
    this._canvas = null;
    this._ctx = null;
    this._rafId = null;

    this._analyser = new Tone.Analyser(mode === "bars" ? "fft" : "waveform", bins);

    if (source) {
      const node = source._ ?? source;
      try { node.connect(this._analyser); } catch (_) {}
    }

    _vizs.push(this);
  }

  _initCanvas() {
    this._canvas = document.createElement("canvas");
    const wrapper = document.getElementById("canvasWrapper");
    const ref = wrapper?.querySelector("canvas");
    this._canvas.width = ref?.width ?? 1600;
    this._canvas.height = ref?.height ?? 900;
    Object.assign(this._canvas.style, {
      position: "absolute", top: "0", left: "0",
      width: "100%", height: "100%",
      zIndex: String(this._z),
      opacity: String(this._opacity),
      pointerEvents: "none",
    });
    wrapper?.appendChild(this._canvas);
    this._ctx = this._canvas.getContext("2d");
  }

  _drawBars() {
    const data = this._analyser.getValue();
    const ctx = this._ctx;
    const W = this._canvas.width, H = this._canvas.height;
    const n = data.length;
    ctx.clearRect(0, 0, W, H);
    const bw = W / n;
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, (data[i] + 100) / 100);
      const h = v * H;
      const hue = this._color != null ? this._color : (i / n) * 240;
      ctx.fillStyle = `hsl(${hue}, 90%, ${25 + v * 45}%)`;
      ctx.fillRect(i * bw, H - h, bw - 1, h);
    }
  }

  _drawWave() {
    const data = this._analyser.getValue();
    const ctx = this._ctx;
    const W = this._canvas.width, H = this._canvas.height;
    const mid = H / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.strokeStyle = this._color != null ? `hsl(${this._color}, 90%, 60%)` : "hsl(120, 90%, 60%)";
    ctx.lineWidth = 2;
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * W;
      const y = mid - data[i] * mid;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  _drawRing() {
    const data = this._analyser.getValue();
    const ctx = this._ctx;
    const W = this._canvas.width, H = this._canvas.height;
    const cx = W / 2, cy = H / 2;
    const r = Math.min(W, H) * 0.25;
    const n = data.length;
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.strokeStyle = this._color != null ? `hsl(${this._color}, 90%, 65%)` : "hsl(270, 90%, 70%)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const v = data[i % n];
      const rad = r + v * r * 0.6;
      const x = cx + Math.cos(angle) * rad;
      const y = cy + Math.sin(angle) * rad;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  _frame() {
    if (this._mode === "wave") this._drawWave();
    else if (this._mode === "ring") this._drawRing();
    else this._drawBars();
    this._rafId = requestAnimationFrame(() => this._frame());
  }

  start() {
    if (!this._canvas) this._initCanvas();
    if (!this._rafId) this._frame();
    (window.__ar_keepAlive ??= new Set()).add(this);
    return this;
  }

  stop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    window.__ar_keepAlive?.delete(this);
    return this;
  }

  mode(m) {
    this._mode = m;
    this._analyser.type = m === "bars" ? "fft" : "waveform";
    return this;
  }

  color(hue) { this._color = hue; return this; }

  opacity(n) {
    this._opacity = n;
    if (this._canvas) this._canvas.style.opacity = String(n);
    return this;
  }

  z(n) {
    this._z = n;
    if (this._canvas) this._canvas.style.zIndex = String(n);
    return this;
  }

  // Apply a WebGPU shader to this viz's canvas.
  // fnOrPreset: arrow function (v, t?) => [r, g, b, a]  OR  preset name string.
  // Returns the started Shader — call .stop()/.opacity()/.z() on it.
  shader(fnOrPreset, opts = {}) {
    if (!this._canvas) this.start();
    let body;
    if (typeof fnOrPreset === "string") {
      body = VIZ_SHADER_PRESETS[fnOrPreset];
      if (!body) throw new Error(`viz.shader(): unknown preset '${fnOrPreset}'. Available: ${Object.keys(VIZ_SHADER_PRESETS).join(", ")}`);
    } else if (typeof fnOrPreset === "function") {
      body = fnToWGSL(fnOrPreset);
    } else {
      throw new Error("viz.shader() expects an arrow function or a preset name string");
    }
    return new Shader(body, { video: this._canvas, ...opts }).start();
  }

  get canvas() { return this._canvas; }

  static get presets() { return Object.keys(VIZ_SHADER_PRESETS); }

  _destroy() {
    this.stop();
    this._canvas?.remove();
    try { this._analyser.dispose(); } catch (_) {}
  }
}
