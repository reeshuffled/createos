import * as THREE from 'three';
import { onReset } from '../runtime/reset-registry.js';
import { liveOutput } from '../runtime/keep-alive.js';

export { THREE };

const _scenes = [];

export function cleanupThree() {
  for (const s of _scenes) s._destroy();
  _scenes.length = 0;
}

export class ThreeScene {
  constructor(opts = {}) {
    const {
      z = 30,
      width,
      height,
      alpha = true,
      antialias = true,
    } = opts;

    this._z = z;
    this._tickFns = [];
    this._rafId = null;
    this._startTime = null;
    this._lastTime = null;
    this._destroyed = false;
    this._bindings = {};

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, (width || 800) / (height || 600), 0.1, 1000);
    this.camera.position.z = 5;

    this.renderer = new THREE.WebGLRenderer({ antialias, alpha });
    const wrapper = window.__ar_canvasWrapper ?? document.getElementById('canvasWrapper');
    const w = width || wrapper?.offsetWidth || 800;
    const h = height || wrapper?.offsetHeight || 600;
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.canvas = this.renderer.domElement;
    this.canvas.style.cssText = [
      'position:absolute', 'top:0', 'left:0',
      'width:100%', 'height:100%',
      `z-index:${z}`, 'pointer-events:none',
    ].join(';');

    _scenes.push(this);
  }

  start() {
    if (this._rafId || this._destroyed) return this;
    const wrapper = window.__ar_canvasWrapper ?? document.getElementById('canvasWrapper');
    if (wrapper && !wrapper.contains(this.canvas)) wrapper.appendChild(this.canvas);
    this._live = liveOutput(this);
    this._startTime = performance.now();
    this._lastTime = this._startTime;

    const loop = (now) => {
      if (this._destroyed) return;
      this._rafId = requestAnimationFrame(loop);
      if (window.__ar_paused) return;
      const dt = (now - this._lastTime) / 1000;
      const elapsed = (now - this._startTime) / 1000;
      this._lastTime = now;
      for (const fn of this._tickFns) {
        try { fn(dt, elapsed); } catch (e) { console.error('[ThreeScene tick]', e); }
      }
      this.renderer.render(this.scene, this.camera);
    };
    this._rafId = requestAnimationFrame(loop);
    return this;
  }

  stop() {
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
    this._live?.release();
    return this;
  }

  tick(fn) {
    this._tickFns.push(fn);
    return this;
  }

  // bind(name, fn) — registers a live signal for use in tick callbacks via scene.get(name)
  bind(name, fn) {
    this._bindings[name] = fn;
    window.__ar_signalRoutes?.push({ source: String(name), sink: 'ThreeScene', label: String(name) });
    return this;
  }

  get(name) {
    const fn = this._bindings[name];
    return fn ? fn() : undefined;
  }

  add(obj) { this.scene.add(obj); return this; }
  remove(obj) { this.scene.remove(obj); return this; }

  z(n) {
    this._z = n;
    this.canvas.style.zIndex = String(n);
    return this;
  }

  opacity(v) {
    this.canvas.style.opacity = String(v);
    return this;
  }

  resize(w, h) {
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    return this;
  }

  _destroy() {
    this.stop();
    this._tickFns = [];
    this._bindings = {};
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.renderer.dispose();
    this._destroyed = true;
  }
}

// Register teardown with the reset registry (ADR 008).
onReset(cleanupThree);
