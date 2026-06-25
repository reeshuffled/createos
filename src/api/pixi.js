import * as PIXI from 'pixi.js';
import { onReset } from '../runtime/reset-registry.js';

let _app = null;
let _userTickerFns = new Set();
let _resizeObserver = null;

export function initPixi() {
  if (_app) return;

  const wrapper    = window.__ar_canvasWrapper ?? document.getElementById('canvasWrapper');
  const fsContainer = window.__ar_fsContainer  ?? document.getElementById('fsContainer');
  const refCanvas  = wrapper?.querySelector('canvas');
  const w = refCanvas?.width  ?? 1600;
  const h = refCanvas?.height ?? 900;

  _app = new PIXI.Application({
    width: w,
    height: h,
    backgroundAlpha: 0,
    antialias: true,
    resolution: 1,
  });

  Object.assign(_app.view.style, {
    position: 'absolute',
    top: '0', left: '0',
    width: '100%', height: '100%',
    zIndex: '25',
    pointerEvents: 'none',
  });
  (fsContainer ?? wrapper ?? document.body).appendChild(_app.view);

  // Pause integration — skip render when IDE is paused
  const _origRender = _app.renderer.render.bind(_app.renderer);
  _app.renderer.render = (stage) => {
    if (!window.__ar_paused) _origRender(stage);
  };

  // Resize with canvas wrapper
  if (wrapper) {
    _resizeObserver = new ResizeObserver(() => {
      const rw = Math.round((wrapper.clientWidth  ?? 0) * devicePixelRatio) || 1600;
      const rh = Math.round((wrapper.clientHeight ?? 0) * devicePixelRatio) || 900;
      _app.renderer.resize(rw, rh);
    });
    _resizeObserver.observe(wrapper);
  }

  // Convenience: tracked tick — cleaned up on reset
  _app.tick = (fn) => {
    _userTickerFns.add(fn);
    _app.ticker.add(fn);
    return fn;
  };

  window.pixi  = _app;
  window.Stage = _app.stage;
}

export function cleanupPixi() {
  if (!_app) return;
  for (const fn of _userTickerFns) _app.ticker.remove(fn);
  _userTickerFns.clear();
  _app.stage.removeChildren();
}

export { PIXI };

// Register teardown with the reset registry (ADR 008).
onReset(cleanupPixi);
