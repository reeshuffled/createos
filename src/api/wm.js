// Window manager: draggable/resizable floating windows + named tiling layouts.
// All layout coords are 0–1 fractions of desktop size, resolved to px at apply time.

// win-camera and win-mic are toggle-controlled (shown by camera.js / mic.js).
// win-console is output-controlled (shown by app.js when there's content).
// Layouts only position the tiled windows; floating windows manage themselves.

import * as Tone from 'tone';

// ── File browser helpers ──────────────────────────────────────────────────────

function _fileIcon(ext) {
  if (['jpg','jpeg','png','gif','webp','svg','bmp','ico'].includes(ext)) return '🖼';
  if (['mp4','webm','mov','avi','mkv'].includes(ext)) return '🎬';
  if (['mp3','wav','ogg','flac','aac','m4a'].includes(ext)) return '🎵';
  if (['js','ts','jsx','tsx','mjs'].includes(ext)) return '📜';
  if (['wgsl','glsl'].includes(ext)) return '✨';
  if (['json'].includes(ext)) return '{ }';
  return '📄';
}

function _makeFileEntry(entry, depth, onSelect) {
  const li = document.createElement('div');
  li.style.cssText = 'font-family:monospace;font-size:11px;white-space:nowrap;user-select:none;';

  const row = document.createElement('div');
  row.style.cssText = `display:flex;align-items:center;gap:5px;padding:3px 8px 3px ${8 + depth * 14}px;cursor:pointer;`;

  if (entry.kind === 'directory') {
    const arrow = document.createElement('span');
    arrow.textContent = '▶';
    arrow.style.cssText = 'font-size:7px;color:#888;display:inline-block;width:8px;transition:transform 0.15s;flex-shrink:0;';
    const icon = document.createElement('span');
    icon.textContent = '📁';
    const name = document.createElement('span');
    name.textContent = entry.name;
    name.style.color = '#333';
    row.appendChild(arrow); row.appendChild(icon); row.appendChild(name);
    li.appendChild(row);

    let expanded = false;
    let childContainer = null;
    row.addEventListener('click', async () => {
      expanded = !expanded;
      arrow.style.transform = expanded ? 'rotate(90deg)' : '';
      if (expanded && !childContainer) {
        childContainer = document.createElement('div');
        li.appendChild(childContainer);
        await _renderDirContents(childContainer, entry, depth + 1, onSelect);
      }
      if (childContainer) childContainer.style.display = expanded ? '' : 'none';
    });
  } else {
    const spacer = document.createElement('span');
    spacer.style.cssText = 'width:8px;display:inline-block;flex-shrink:0;';
    const icon = document.createElement('span');
    icon.textContent = _fileIcon(entry.name.split('.').pop().toLowerCase());
    const name = document.createElement('span');
    name.textContent = entry.name;
    name.style.color = '#222';
    row.appendChild(spacer); row.appendChild(icon); row.appendChild(name);
    li.appendChild(row);

    row.addEventListener('click', async () => {
      const file = await entry.getFile();
      const url = URL.createObjectURL(file);
      onSelect?.(url, entry.name, entry);
    });
  }

  row.addEventListener('mouseenter', () => { row.style.background = '#e8f0fe'; });
  row.addEventListener('mouseleave', () => { row.style.background = ''; });
  return li;
}

async function _renderDirContents(container, dirHandle, depth, onSelect) {
  const entries = [];
  for await (const entry of dirHandle.values()) entries.push(entry);
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    container.appendChild(_makeFileEntry(entry, depth, onSelect));
  }
}

const LAYOUTS = {
  split: {
    'win-toolkit': { x: 0,    y: 0, w: 0.13, h: 1,    show: true },
    'win-editor':  { x: 0.13, y: 0, w: 0.87, h: 1,    show: true },
    'win-canvas':  { show: false },
    'win-console': { show: false },
  },
};

export function initWM(onContentResize) {
  const desktop = document.getElementById('desktop');
  let zTop = 100;
  let currentLayout = 'split';
  const savedGeometry = new Map();
  const spawnedIds = new Set();
  const fileHandles = new Map();
  const _builtinFactories = new Map();
  let spawnCounter = 0;

  // Per-window Tone.Channel nodes — created lazily on first use
  const _channels = new Map();

  function _getChannel(winId) {
    if (!_channels.has(winId)) {
      const ch = new Tone.Channel().toDestination();
      _channels.set(winId, ch);
    }
    return _channels.get(winId);
  }

  function _disposeChannel(winId) {
    const ch = _channels.get(winId);
    if (ch) { try { ch.dispose(); } catch (_) {} _channels.delete(winId); }
  }

  // Inject mute + volume controls into a window's titlebar.
  // videoEl: optional <video> element to co-control (for spawned video windows).
  function _addAudioControls(win, videoEl) {
    const tb = win.querySelector('.wm-titlebar');
    if (!tb) return;

    const ctrl = document.createElement('span');
    ctrl.className = 'wm-audio-ctrl';

    const muteBtn = document.createElement('button');
    muteBtn.className = 'wm-mute';
    muteBtn.title = 'Mute';
    muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';

    const volSlider = document.createElement('input');
    volSlider.type = 'range';
    volSlider.className = 'wm-vol';
    volSlider.min = '0';
    volSlider.max = '100';
    volSlider.value = '100';
    volSlider.title = 'Volume';

    ctrl.appendChild(muteBtn);
    ctrl.appendChild(volSlider);

    const firstBtn = tb.querySelector('.wm-btn');
    tb.insertBefore(ctrl, firstBtn);

    let _muted = false;

    function _apply() {
      const linear = parseFloat(volSlider.value) / 100;
      if (videoEl) {
        videoEl.muted = _muted;
        videoEl.volume = _muted ? 0 : linear;
      }
      // Eagerly create channel so state is set even before user routes audio to it
      const ch = _getChannel(win.id);
      ch.mute = _muted;
      ch.volume.value = linear <= 0 ? -60 : (linear - 1) * 40;
    }

    muteBtn.addEventListener('click', e => {
      e.stopPropagation();
      _muted = !_muted;
      muteBtn.innerHTML = _muted
        ? '<i class="fa-solid fa-volume-xmark"></i>'
        : '<i class="fa-solid fa-volume-high"></i>';
      muteBtn.classList.toggle('muted', _muted);
      volSlider.style.opacity = _muted ? '0.4' : '1';
      _apply();
    });

    volSlider.addEventListener('input', e => {
      e.stopPropagation();
      if (_muted) {
        _muted = false;
        muteBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
        muteBtn.classList.remove('muted');
        volSlider.style.opacity = '1';
      }
      _apply();
    });

    // Prevent slider drag from bubbling to window drag handler
    volSlider.addEventListener('mousedown', e => e.stopPropagation());
  }

  function getWin(id) { return document.getElementById(id); }

  function applyLayout(name) {
    const layout = LAYOUTS[name];
    if (!layout) return;
    currentLayout = name;
    const dw = desktop.offsetWidth;
    const dh = desktop.offsetHeight;

    for (const [id, cfg] of Object.entries(layout)) {
      let win = document.getElementById(id);
      if (!win) {
        const factory = _builtinFactories.get(id);
        if (factory) factory();
        win = document.getElementById(id);
      }
      if (!win) continue;
      if (!cfg.show) { win.style.display = 'none'; continue; }
      win.style.display = 'flex';
      win.style.left   = `${Math.round(cfg.x * dw)}px`;
      win.style.top    = `${Math.round(cfg.y * dh)}px`;
      win.style.width  = `${Math.round(cfg.w * dw)}px`;
      win.style.height = `${Math.round(cfg.h * dh)}px`;
      win.style.zIndex = String(zTop++);
    }

    document.querySelectorAll('[data-layout]').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.layout === name)
    );
    requestAnimationFrame(() => onContentResize?.());
  }

  function bringToFront(win) {
    win.style.zIndex = String(zTop++);
  }

  // Drag via titlebar
  desktop.addEventListener('mousedown', e => {
    const tb = e.target.closest('.wm-titlebar');
    if (!tb || e.target.closest('.wm-btn')) return;
    if (e.target.closest('[contenteditable="true"]')) return;
    const win = tb.closest('.wm-win');
    bringToFront(win);
    const ox = e.clientX - win.offsetLeft;
    const oy = e.clientY - win.offsetTop;
    const onMove = e => {
      const dw = desktop.offsetWidth, dh = desktop.offsetHeight;
      win.style.left = `${Math.max(0, Math.min(dw - 80,  e.clientX - ox))}px`;
      win.style.top  = `${Math.max(0, Math.min(dh - 28,  e.clientY - oy))}px`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      onContentResize?.();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });

  // Resize via corner handles (SE and SW)
  desktop.addEventListener('mousedown', e => {
    const isSE = e.target.classList.contains('wm-resize');
    const isSW = e.target.classList.contains('wm-resize-sw');
    if (!isSE && !isSW) return;
    const win = e.target.closest('.wm-win');
    bringToFront(win);
    const sx = e.clientX, sy = e.clientY;
    const sw = win.offsetWidth, sh = win.offsetHeight;
    const sl = win.offsetLeft;
    const onMove = e => {
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (isSE) {
        win.style.width  = `${Math.max(180, sw + dx)}px`;
      } else {
        const newW = Math.max(180, sw - dx);
        win.style.width = `${newW}px`;
        win.style.left  = `${sl + sw - newW}px`;
      }
      win.style.height = `${Math.max(80, sh + dy)}px`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      onContentResize?.();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
    e.stopPropagation();
  });

  // Click window to bring to front
  desktop.addEventListener('mousedown', e => {
    const win = e.target.closest('.wm-win');
    if (win) bringToFront(win);
  }, true);

  // Duplicate button
  desktop.addEventListener('click', e => {
    if (!e.target.closest('.wm-dup')) return;
    const win = e.target.closest('.wm-win');
    if (!win?._wmSpawnOpts) return;
    const { title: t, ...savedOpts } = win._wmSpawnOpts;
    api.spawn(t, {
      ...savedOpts,
      id: undefined,
      x: win.offsetLeft + 24,
      y: win.offsetTop  + 24,
      w: win.offsetWidth,
      h: win.offsetHeight,
    });
  });

  // Close button
  desktop.addEventListener('click', e => {
    if (!e.target.classList.contains('wm-close')) return;
    const win = e.target.closest('.wm-win');
    if (spawnedIds.has(win.id)) {
      win._wmCleanup?.();
      win._wmRescueContent?.();
      _disposeChannel(win.id);
      win.remove();
      spawnedIds.delete(win.id);
    } else {
      win.style.display = 'none';
    }
  });

  // Maximize / restore button
  desktop.addEventListener('click', e => {
    const btn = e.target.closest('.wm-max');
    if (!btn) return;
    const win = btn.closest('.wm-win');
    _toggleMaximize(win, btn);
    onContentResize?.();
  });

  function _toggleMaximize(win, btn) {
    btn = btn || win.querySelector('.wm-max');
    if (win.classList.contains('wm-maximized')) {
      const saved = savedGeometry.get(win.id);
      if (saved) {
        win.style.left   = saved.left;
        win.style.top    = saved.top;
        win.style.width  = saved.width;
        win.style.height = saved.height;
      }
      win.classList.remove('wm-maximized');
      if (btn) { btn.innerHTML = '<i class="fa-regular fa-window-maximize"></i>'; btn.title = 'Maximize'; }
    } else {
      savedGeometry.set(win.id, {
        left:   win.style.left,
        top:    win.style.top,
        width:  win.style.width,
        height: win.style.height,
      });
      win.style.left   = '0';
      win.style.top    = '0';
      win.style.width  = '100%';
      win.style.height = '100%';
      win.style.zIndex = String(zTop++);
      win.classList.add('wm-maximized');
      if (btn) { btn.innerHTML = '<i class="fa-solid fa-window-restore"></i>'; btn.title = 'Restore'; }
    }
  }

  // Rename: double-click title label
  desktop.addEventListener('dblclick', e => {
    const title = e.target.closest('.wm-title');
    if (!title) return;
    const original = title.textContent;
    title.contentEditable = 'true';
    title.focus();
    const range = document.createRange();
    range.selectNodeContents(title);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const commit = () => {
      title.contentEditable = 'false';
      title.removeEventListener('blur', commit);
      title.removeEventListener('keydown', onKey);
    };
    const onKey = e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { title.textContent = original; commit(); }
    };
    title.addEventListener('blur', commit);
    title.addEventListener('keydown', onKey);
  });

  // Nav layout buttons
  document.querySelectorAll('[data-layout]').forEach(btn =>
    btn.addEventListener('click', () => applyLayout(btn.dataset.layout))
  );

  // Hotkeys
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === '1') { e.preventDefault(); applyLayout('split'); }
  });

  // Re-tile on browser resize
  window.addEventListener('resize', () => applyLayout(currentLayout));

  // Pre-existing built-in windows have no audio output — no controls needed.

  // ── Public API (exposed as window.wm) ────────────────────────────────────

  const api = {
    /** Show a window by id */
    show(id) {
      const win = getWin(id);
      if (!win) return;
      win.style.display = 'flex';
      bringToFront(win);
    },

    /** Hide a window by id (built-ins hidden, spawned windows removed) */
    hide(id) {
      const win = getWin(id);
      if (!win) return;
      if (spawnedIds.has(id)) {
        win._wmCleanup?.();
        win.remove();
        spawnedIds.delete(id);
      } else {
        win.style.display = 'none';
      }
    },

    /** Alias for hide */
    close(id) { api.hide(id); },

    /** Toggle visibility */
    toggle(id) {
      const win = getWin(id);
      if (!win) return;
      if (win.style.display === 'none') api.show(id); else api.hide(id);
    },

    /** Bring window to front */
    focus(id) {
      const win = getWin(id);
      if (win) bringToFront(win);
    },

    /** Move window to pixel coords */
    move(id, x, y) {
      const win = getWin(id);
      if (!win) return;
      win.style.left = `${x}px`;
      win.style.top  = `${y}px`;
    },

    /** Resize window in pixels */
    resize(id, w, h) {
      const win = getWin(id);
      if (!win) return;
      win.style.width  = `${Math.max(180, w)}px`;
      win.style.height = `${Math.max(80,  h)}px`;
      onContentResize?.();
    },

    /** Maximize a window */
    maximize(id) {
      const win = getWin(id);
      if (!win || win.classList.contains('wm-maximized')) return;
      _toggleMaximize(win);
      onContentResize?.();
    },

    /** Restore a maximized window */
    restore(id) {
      const win = getWin(id);
      if (!win || !win.classList.contains('wm-maximized')) return;
      _toggleMaximize(win);
      onContentResize?.();
    },

    /** Switch to a named layout */
    layout(name) { applyLayout(name); },

    /** Return the current layout name */
    getLayout() { return currentLayout; },

    /**
     * Spawn a new floating window.
     * @param {string} title  - Titlebar label
     * @param {object} [opts] - { type, x, y, w, h, id, ...type-specific }
     *   type: 'html'   → opts.html (string)
     *   type: 'image'  → opts.src (URL or blob URL)
     *   type: 'video'  → opts.src (URL or blob URL), opts.loop, opts.controls
     *   type: 'camera' → mirrors #camera canvas
     *   type: 'canvas' → opts.z (default 0) mirrors layer canvas at z
     *   type: 'shader' → opts.shader (Shader instance)
     * @returns {string}  window id
     */
    spawn(title, opts = {}) {
      const dw = desktop.offsetWidth, dh = desktop.offsetHeight;
      const id  = opts.id || `win-spawn-${++spawnCounter}`;
      const w   = opts.w  ?? 320;
      const h   = opts.h  ?? 240;
      const x   = opts.x  ?? Math.round((dw - w) / 2);
      const y   = opts.y  ?? Math.round((dh - h) / 2);
      const type = opts.type ?? 'html';

      const win = document.createElement('div');
      win.className = 'wm-win';
      win.id = id;
      win.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;display:flex;`;
      win.innerHTML = `
        <div class="wm-titlebar">
          <span class="wm-title">${title}</span>
          <span class="wm-btn wm-dup" title="Duplicate"><i class="fa-regular fa-copy"></i></span>
          <span class="wm-btn wm-max" title="Maximize"><i class="fa-regular fa-window-maximize"></i></span>
          <span class="wm-btn wm-close" title="Close">×</span>
        </div>
        <div class="wm-body" style="overflow:auto;position:relative;"></div>
        <div class="wm-resize-sw"></div>
        <div class="wm-resize"></div>
      `;
      const body = win.querySelector('.wm-body');

      let _cleanup = null;

      if (type === 'html') {
        body.innerHTML = opts.html ?? '';
      } else if (type === 'image') {
        const img = document.createElement('img');
        img.src = opts.src ?? '';
        img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
        body.style.overflow = 'hidden';
        body.appendChild(img);
      } else if (type === 'video') {
        const vid = document.createElement('video');
        vid.src = opts.src ?? '';
        vid.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
        vid.autoplay = true;
        vid.muted = true;
        vid.loop = opts.loop !== false;
        if (opts.controls) vid.controls = true;
        body.style.overflow = 'hidden';
        body.appendChild(vid);
        _cleanup = () => { vid.pause(); vid.src = ''; };
      } else if (type === 'camera' || type === 'canvas' || type === 'shader') {
        let src;
        if (type === 'camera') {
          src = document.getElementById('camera');
        } else if (type === 'canvas') {
          src = window.__ar_layers?.get(opts.z ?? 0);
        } else {
          src = opts.shader?.canvas;
        }
        if (src) {
          const dst = document.createElement('canvas');
          dst.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
          body.style.overflow = 'hidden';
          body.style.background = '#000';
          body.appendChild(dst);
          const ctx = dst.getContext('2d');
          let rafId;
          const copy = () => {
            if (src.width && src.height) {
              dst.width = src.width;
              dst.height = src.height;
              ctx.drawImage(src, 0, 0);
            }
            rafId = requestAnimationFrame(copy);
          };
          rafId = requestAnimationFrame(copy);
          _cleanup = () => cancelAnimationFrame(rafId);
        }
      }

      if (_cleanup) win._wmCleanup = _cleanup;
      win._wmSpawnOpts = { title, ...opts };

      if (type === 'video' || type === 'html') {
        const videoEl = type === 'video' ? body.querySelector('video') : null;
        _addAudioControls(win, videoEl);
      }

      desktop.appendChild(win);
      spawnedIds.add(id);
      bringToFront(win);
      return id;
    },

    /** List all window ids currently in the desktop */
    list() {
      return [...desktop.querySelectorAll('.wm-win')].map(w => w.id);
    },

    /**
     * Pick a file via the browser file picker. Returns a blob URL.
     * Pass a key to cache the handle — subsequent calls reuse it without re-prompting.
     * @param {string} [key]   - cache key for the handle
     * @param {object} [opts]  - showOpenFilePicker options (types, multiple, etc.)
     * @returns {Promise<string>}  blob URL
     */
    async pickFile(key, opts = {}) {
      if (key && fileHandles.has(key)) {
        const handle = fileHandles.get(key);
        try {
          const perm = await handle.queryPermission({ mode: 'read' });
          if (perm === 'granted') {
            return URL.createObjectURL(await handle.getFile());
          }
        } catch (_) { /* handle stale — fall through to picker */ }
      }
      const pickerOpts = {
        multiple: false,
        ...opts,
      };
      const [handle] = await window.showOpenFilePicker(pickerOpts);
      if (key) fileHandles.set(key, handle);
      return URL.createObjectURL(await handle.getFile());
    },

    /**
     * Open a directory picker and spawn a floating file browser window.
     * @param {string} [key]           - cache key (reuses handle without re-prompting)
     * @param {function} [onSelect]    - called with (blobUrl, filename, fileHandle) on file click
     * @param {object} [spawnOpts]     - { w, h, x, y, id } forwarded to spawn()
     * @returns {Promise<string>}  window id
     */
    async browse(key, onSelect, spawnOpts = {}) {
      let dirHandle;
      if (key && fileHandles.has(key)) {
        const h = fileHandles.get(key);
        if (h.kind === 'directory') {
          try {
            const perm = await h.queryPermission({ mode: 'read' });
            if (perm === 'granted') dirHandle = h;
          } catch (_) {}
        }
      }
      if (!dirHandle) {
        dirHandle = await window.showDirectoryPicker({ mode: 'read' });
        if (key) fileHandles.set(key, dirHandle);
      }

      const winId = api.spawn(dirHandle.name, {
        type: 'html',
        html: '',
        w: spawnOpts.w ?? 260,
        h: spawnOpts.h ?? 400,
        x: spawnOpts.x,
        y: spawnOpts.y,
        id: spawnOpts.id,
      });
      const win = document.getElementById(winId);
      const body = win.querySelector('.wm-body');
      body.innerHTML = '';
      body.style.overflow = 'auto';
      body.style.flexDirection = 'column';
      body.style.padding = '2px 0';

      _renderDirContents(body, dirHandle, 0, onSelect);
      return winId;
    },

    /**
     * Get (or create) the Tone.Channel for a window.
     * Route audio to it: synth.connect(wm.channel('win-editor'))
     * The window's mute/volume controls will then affect that audio.
     */
    channel(id) { return _getChannel(id); },

    /** Register a factory fn that (re)creates a built-in window by id */
    registerBuiltin(id, factory) { _builtinFactories.set(id, factory); },

    /** Create (or recreate) a built-in window by id */
    createBuiltin(id) { _builtinFactories.get(id)?.(); },

    LAYOUTS,
    applyLayout,
  };

  return api;
}
