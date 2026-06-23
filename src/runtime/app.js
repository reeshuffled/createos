import { friendlyError, addInfiniteLoopProtection } from "../editor/live-patch.js";
import { vision, stopVision, preloadVision } from "../api/vision.js";
import { TOOLKIT_CATEGORIES } from "../editor/completions.js";
import { initCamera, Camera, cleanupCameras } from "../api/camera.js";
import { initMic } from "../api/mic.js";
import { freezeTimers, restoreTimers } from "./timer-manager.js";
import { initInlineWidgets } from "../editor/inline-widgets.js";
import { audio, startAudio, cleanupAudio } from "../api/audio.js";
import { Shader, ShaderFX, cleanupShaders } from "../api/shader.js";
import { AudioViz, cleanupViz } from "../api/viz.js";
import { Media, cleanupMedia } from "../api/media.js";
import { getLayerForZ } from "../api/layer.js";
import { getDraw, cleanupDraw } from "../api/draw.js";
import { initBlockly, initPaletteWorkspace, onPaletteClick, getWorkspaceCode, resizeBlockly, workspaceIsEmpty, loadWorkspaceJSON, TOOLBOX_CATEGORY_META, hideInternalToolbox, finishBlockRenders, registerSidebarDeleteZone } from "../blocks/blocks.js";
import { jsToBlocks } from "../blocks/js-to-blocks.js";
import { initWM } from "../api/wm.js";
import { initDOMCaptures, captureWindow as _captureWindow, cleanupCaptures } from "../editor/editor-capture.js";

// Capture native timer/event functions before any user-code patching.
const _nativeSetInterval = window.setInterval.bind(window);
const _nativeClearInterval = window.clearInterval.bind(window);
const _nativeSetTimeout = window.setTimeout.bind(window);
const _nativeClearTimeout = window.clearTimeout.bind(window);
const _nativeELAdd = EventTarget.prototype.addEventListener;

window.vision = vision;
window.audio = audio;
window.Shader = Shader;
window.ShaderFX = ShaderFX;
window.Camera = Camera;
window.AudioViz = AudioViz;
window.Media = Media;
window.pat = (str, inst, opts) => audio.pat(str, inst, opts);
window.stack = (...pats) => audio.stack(...pats);

class Color {
  static random() {
    return `hsl(${Math.floor(Math.random() * 360)},${50 + Math.floor(Math.random() * 50)}%,${40 + Math.floor(Math.random() * 30)}%)`;
  }
  static invert(color) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgb(${255 - r}, ${255 - g}, ${255 - b})`;
  }
}
window.Color = Color;

window.onKey = (key, fn) => {
  document.addEventListener("keydown", (e) => {
    if (key === "any" || e.key === key) fn(e);
  });
};

window.randUni = (lo, hi) => Math.random() * (hi - lo) + lo;

preloadVision();

window.onload = () => {
  // ── Editor ────────────────────────────────────────────────────────────────
  const STORAGE_KEY = "vl-ide-code";
  const savedCode = localStorage.getItem(STORAGE_KEY);
  const initialCode = savedCode ?? document.getElementById("code_text").innerHTML.trim();

  const editor = CodeMirror(document.getElementById("editor"), {
    mode: "javascript",
    lineNumbers: true,
    value: initialCode,
    extraKeys: { "Ctrl-Space": "autocomplete", "Ctrl-Q": (cm) => cm.foldCode(cm.getCursor()) },
    foldGutter: true,
    gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
    hintOptions: { completeSingle: false },
    matchBrackets: true,
    autoCloseBrackets: true,
    styleActiveLine: true,
  });

  const inlineWidgets = initInlineWidgets(editor);

  let saveTimer;
  editor.on("change", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => localStorage.setItem(STORAGE_KEY, editor.getValue()), 500);
  });

  editor.setOption("lint", true);

  // ── Toolkit (drag-to-text) ────────────────────────────────────────────────
  const toolkitBody = document.getElementById("toolkit-body");
  const toolTipEl = document.createElement("div");
  toolTipEl.id = "toolkit-tooltip";
  document.body.appendChild(toolTipEl);

  const showTooltip = (text, anchorEl) => {
    toolTipEl.textContent = text;
    toolTipEl.style.display = "block";
    const rect = anchorEl.getBoundingClientRect();
    toolTipEl.style.left = `${rect.right + 8}px`;
    toolTipEl.style.top = `${rect.top + rect.height / 2}px`;
    toolTipEl.style.transform = "translateY(-50%)";
  };
  const hideTooltip = () => { toolTipEl.style.display = "none"; };

  for (const cat of TOOLKIT_CATEGORIES) {
    const catEl = document.createElement("div");
    catEl.className = "toolkit-category";
    catEl.textContent = cat.name;
    toolkitBody.appendChild(catEl);
    for (const cmd of cat.commands) {
      const btn = document.createElement("div");
      btn.className = "toolkit-btn";
      btn.draggable = true;
      btn.innerHTML = `<span>${cmd.label}</span><span class="toolkit-info" title="">ℹ</span>`;
      btn.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("application/x-ar-toolkit", cmd.code);
        e.dataTransfer.effectAllowed = "copy";
        btn.classList.add("dragging");
        hideTooltip();
      });
      btn.addEventListener("dragend", () => btn.classList.remove("dragging"));
      if (cmd.hint) {
        const infoSpan = btn.querySelector(".toolkit-info");
        infoSpan.addEventListener("mouseenter", () => showTooltip(cmd.hint, infoSpan));
        infoSpan.addEventListener("mouseleave", hideTooltip);
        infoSpan.addEventListener("mousedown", (e) => e.stopPropagation());
      }
      toolkitBody.appendChild(btn);
    }
  }

  const cmWrapper = editor.getWrapperElement();
  cmWrapper.addEventListener("dragover", (e) => {
    if (e.dataTransfer.types.includes("application/x-ar-toolkit")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  });
  cmWrapper.addEventListener("drop", (e) => {
    const code = e.dataTransfer.getData("application/x-ar-toolkit");
    if (!code) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = editor.coordsChar({ left: e.clientX, top: e.clientY });
    editor.focus();
    editor.replaceRange(code + "\n", pos);
    editor.setCursor({ line: pos.line + code.split("\n").length, ch: 0 });
  });

  let currentScript = null;
  let blocklyWorkspace = null;
  let paletteWorkspace = null;

  // ── Canvas / Layer system ─────────────────────────────────────────────────
  const mainCanvas = document.getElementById("canvas");
  const canvasWrapper = document.getElementById("canvasWrapper");
  canvasWrapper.tabIndex = 0;

  window.__ar_layers = new Map([[0, mainCanvas]]);
  window.__ar_getLayerCanvas = (z) => {
    if (window.__ar_layers.has(z)) return window.__ar_layers.get(z);
    const c = document.createElement("canvas");
    c.width = mainCanvas.width;
    c.height = mainCanvas.height;
    c.className = "ar-layer";
    Object.assign(c.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      zIndex: String(z < 0 ? z : 20 + z),
      pointerEvents: "none",
    });
    canvasWrapper.appendChild(c);
    window.__ar_layers.set(z, c);
    return c;
  };

  // Expose canvas/layer access to user code
  window.getCanvas = (z = 0) => window.__ar_getLayerCanvas(z);
  window.getLayer = getLayerForZ;
  window.draw = getDraw(0);

  new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    const w = Math.min(width, (height * 16) / 9);
    canvasWrapper.style.width = `${w}px`;
    canvasWrapper.style.height = `${(w * 9) / 16}px`;
  }).observe(document.getElementById("fsContainer"));


  // ── Camera / Mic ──────────────────────────────────────────────────────────
  initCamera();
  initMic();

  // ── Console + Output window show/hide ────────────────────────────────────
  const consoleEl = document.getElementById("console");

  // ── DOM captures (live canvas feeds for shader video: input) ─────────────
  initDOMCaptures(_nativeSetInterval, _nativeClearInterval);
  window.captureWindow = (target, fps) => _captureWindow(target, fps);

  const _log = console.log.bind(console);
  const _error = console.error.bind(console);
  const _clear = console.clear.bind(console);

  const showOutputWin = () => {
    const outputWin = document.getElementById("win-canvas");
    const editorWin = document.getElementById("win-editor");
    if (!outputWin || outputWin.style.display === "flex") return;
    const desk = document.getElementById("desktop");
    const dw = desk.offsetWidth, dh = desk.offsetHeight;
    const editorLeft = editorWin?.offsetLeft ?? 0;
    const editorNewW = Math.round((dw - editorLeft) * 0.45);
    if (editorWin) editorWin.style.width = `${editorNewW}px`;
    outputWin.style.left   = `${editorLeft + editorNewW}px`;
    outputWin.style.top    = "0px";
    outputWin.style.width  = `${dw - editorLeft - editorNewW}px`;
    outputWin.style.height = `${dh}px`;
    outputWin.style.display = "flex";
  };

  const showConsoleWin = () => {
    const consoleWin = document.getElementById("win-console");
    const outputWin  = document.getElementById("win-canvas");
    const editorWin  = document.getElementById("win-editor");
    if (!consoleWin || consoleWin.style.display === "flex") return;
    const desk = document.getElementById("desktop");
    const dw = desk.offsetWidth, dh = desk.offsetHeight;
    const consoleH = Math.round(dh * 0.30);
    const outputVisible = outputWin && outputWin.style.display === "flex";
    if (outputVisible) {
      outputWin.style.height = `${Math.round(dh * 0.68)}px`;
      consoleWin.style.left  = outputWin.style.left;
      consoleWin.style.width = outputWin.style.width;
    } else if (editorWin && editorWin.style.display !== "none") {
      const edLeft  = editorWin.offsetLeft;
      const edWidth = editorWin.offsetWidth;
      editorWin.style.height = `${dh - consoleH}px`;
      consoleWin.style.left  = `${edLeft}px`;
      consoleWin.style.width = `${edWidth}px`;
    } else {
      consoleWin.style.left  = "0px";
      consoleWin.style.width = `${dw}px`;
    }
    consoleWin.style.top    = `${dh - consoleH}px`;
    consoleWin.style.height = `${consoleH}px`;
    consoleWin.style.display = "flex";
  };

  const hideConsoleWin = () => {
    const consoleWin = document.getElementById("win-console");
    const editorWin  = document.getElementById("win-editor");
    if (!consoleWin) return;
    consoleWin.style.display = "none";
    if (editorWin && editorWin.style.display !== "none") {
      const desk = document.getElementById("desktop");
      editorWin.style.height = `${desk.offsetHeight}px`;
    }
  };

  const appendConsole = (html) => {
    consoleEl.innerHTML += (consoleEl.innerHTML ? "<br>" : "") + html;
    consoleEl.scrollTop = consoleEl.scrollHeight;
    showConsoleWin();
  };

  window.clearConsole = () => { consoleEl.innerHTML = ""; hideConsoleWin(); };

  const consoleToggleBtn = document.getElementById("consoleToggleBtn");
  consoleToggleBtn?.addEventListener("click", () => {
    const consoleWin = document.getElementById("win-console");
    const open = consoleWin?.style.display === "flex";
    if (open) hideConsoleWin(); else showConsoleWin();
    consoleToggleBtn.classList.toggle("active", !open);
  });

  const editorToggleBtn = document.getElementById("editorToggleBtn");
  editorToggleBtn?.addEventListener("click", () => {
    let editorWin = document.getElementById("win-editor");
    if (!editorWin) {
      window.wm.layout(window.wm.getLayout());
      editorWin = document.getElementById("win-editor");
      if (!editorWin) return;
      editorToggleBtn.classList.add("active");
      editor.refresh();
      return;
    }
    const open = editorWin.style.display !== "none";
    editorWin.style.display = open ? "none" : "flex";
    editorToggleBtn.classList.toggle("active", !open);
    if (!open) editor.refresh();
  });

  const isMediaPipeLog = (s) =>
    /^[IW]\d{4}|Graph successfully|TensorFlow Lite|gl_context|inference_feedback|gesture_recognizer_graph|face_landmarker_graph|landmark_projection|hand_gesture|Custom gesture/.test(s);

  console.log = (...args) => {
    _log(...args);
    const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a))).join(" ");
    if (!isMediaPipeLog(msg)) appendConsole(msg);
  };
  console.error = (...args) => {
    _error(...args);
    const msg = args.map((a) => (typeof a === "object" && a !== null ? JSON.stringify(a, null, 2) : String(a))).join(" ");
    if (!isMediaPipeLog(msg)) appendConsole(`<span class="err">${msg}</span>`);
  };
  console.clear = () => { consoleEl.innerHTML = ""; hideConsoleWin(); _clear(); };

  // ── Run / Pause / Stop ────────────────────────────────────────────────────
  const ICONS = {
    play:  '<i class="fa-solid fa-play"></i>',
    pause: '<i class="fa-solid fa-pause"></i>',
    reset: '<i class="fa-solid fa-rotate-left"></i>',
  };

  const executeBtn = document.getElementById("execute");
  const stopBtn = document.getElementById("stopBtn");
  const clearCanvasBtn = document.getElementById("clearCanvasBtn");
  let btnState = "idle";
  let idleWatcher = null;

  const patchTimers = () => {
    window.__ar_intervals = new Map();
    window.__ar_timeouts = new Map();
    window.setInterval = (cb, delay, ...args) => {
      const id = _nativeSetInterval(cb, delay, ...args);
      window.__ar_intervals.set(id, { cb, delay, args });
      return id;
    };
    window.clearInterval = (id) => {
      window.__ar_intervals?.delete(id);
      _nativeClearInterval(id);
    };
    window.setTimeout = (cb, delay = 0, ...args) => {
      let id;
      const wrapped = (...a) => { window.__ar_timeouts?.delete(id); cb(...a); };
      id = _nativeSetTimeout(wrapped, delay, ...args);
      window.__ar_timeouts.set(id, { cb, delay, createdAt: Date.now(), args });
      return id;
    };
    window.clearTimeout = (id) => {
      window.__ar_timeouts?.delete(id);
      _nativeClearTimeout(id);
    };
  };

  const unpatchTimers = () => {
    window.setInterval = _nativeSetInterval;
    window.clearInterval = _nativeClearInterval;
    window.setTimeout = _nativeSetTimeout;
    window.clearTimeout = _nativeClearTimeout;
    window.__ar_intervals = new Map();
    window.__ar_timeouts = new Map();
  };

  const patchListeners = () => {
    window.__ar_listeners = [];
    EventTarget.prototype.addEventListener = function (type, handler, options) {
      window.__ar_listeners.push({ target: this, type, handler, options });
      return _nativeELAdd.call(this, type, handler, options);
    };
  };

  const unpatchListeners = () => {
    EventTarget.prototype.addEventListener = _nativeELAdd;
    window.__ar_listeners?.forEach(({ target, type, handler, options }) => {
      target?.removeEventListener(type, handler, options);
    });
    window.__ar_listeners = [];
  };

  const setExecColor = (cls) => {
    executeBtn.classList.remove("btn-green", "btn-orange", "btn-red");
    executeBtn.classList.add(cls);
  };

  const setIdle = () => {
    btnState = "idle";
    executeBtn.innerHTML = ICONS.play;
    executeBtn.title = "Run";
    setExecColor("btn-green");
    stopBtn.style.display = "none";
    clearCanvasBtn.style.display = "none";
  };

  const setRunning = () => {
    btnState = "running";
    executeBtn.innerHTML = ICONS.pause;
    executeBtn.title = "Pause";
    setExecColor("btn-orange");
    stopBtn.style.display = "inline-flex";
    clearCanvasBtn.style.display = "inline-flex";
  };

  const setPaused = () => {
    btnState = "paused";
    executeBtn.innerHTML = ICONS.play;
    executeBtn.title = "Resume";
    setExecColor("btn-green");
    stopBtn.style.display = "inline-flex";
    clearCanvasBtn.style.display = "inline-flex";
  };

  const setStopped = () => {
    if (idleWatcher) { _nativeClearInterval(idleWatcher); idleWatcher = null; }
    btnState = "stopped";
    executeBtn.innerHTML = ICONS.reset;
    executeBtn.title = "Reset";
    setExecColor("btn-red");
    stopBtn.style.display = "none";
    clearCanvasBtn.style.display = "none";
  };

  const stopRunning = () => {
    window.__ar_pausedState = null;
    unpatchTimers();
    unpatchListeners();
    stopVision();
    cleanupAudio();
    cleanupShaders();
    cleanupViz();
    cleanupMedia();
    for (let i = 1; i < 999999; i++) _nativeClearInterval(i);
    idleWatcher = null;
    setStopped();
  };
  window.stop = stopRunning;
  window.stopRunning = stopRunning;

  const startIdleWatcher = () => {
    idleWatcher = _nativeSetInterval(() => {
      if (btnState !== "running") { _nativeClearInterval(idleWatcher); idleWatcher = null; return; }
      const intervals = window.__ar_intervals ?? new Map();
      const listeners = window.__ar_listeners ?? [];
      const keepAlive = window.__ar_keepAlive ?? new Set();
      if (intervals.size === 0 && listeners.length === 0 && keepAlive.size === 0) setStopped();
    }, 300);
  };

  const pauseRunning = () => {
    if (idleWatcher) { _nativeClearInterval(idleWatcher); idleWatcher = null; }
    window.__ar_pausedState = freezeTimers(
      window.__ar_intervals ?? new Map(),
      window.__ar_timeouts ?? new Map(),
      _nativeClearInterval,
      _nativeClearTimeout,
    );
    setPaused();
  };
  window.pause = pauseRunning;

  const resumeRunning = () => {
    restoreTimers(window.__ar_pausedState, window.setInterval, window.setTimeout);
    window.__ar_pausedState = null;
    setRunning();
    startIdleWatcher();
  };
  window.resume = resumeRunning;

  window.onerror = (message, _source, _lineno, _colno, error) => {
    if (btnState !== "running" && btnState !== "paused") return false;
    console.error(`Error: ${friendlyError(error ?? message)}`);
    stopRunning();
    return false;
  };

  window.onunhandledrejection = (e) => {
    if (btnState !== "running" && btnState !== "paused") return;
    console.error(`Error: ${friendlyError(e.reason)}`);
    stopRunning();
  };

  const reset = () => {
    window.__ar_pausedState = null;
    unpatchTimers();
    unpatchListeners();
    stopVision();
    cleanupAudio();
    cleanupShaders();
    cleanupViz();
    cleanupMedia();
    cleanupDraw();
    cleanupCameras();
    cleanupCaptures();
    window.__ar_keepAlive = new Set();
    for (let i = 1; i < 999999; i++) _nativeClearInterval(i);
    idleWatcher = null;
    if (currentScript) { document.body.removeChild(currentScript); currentScript = null; }
    window.__ar_layer_objects?.forEach((layer) => layer.reset());
    window.__ar_layer_objects = new Map();
    for (const [z, c] of window.__ar_layers) {
      c.getContext("2d").clearRect(0, 0, c.width, c.height);
      if (z !== 0) c.remove();
    }
    window.__ar_layers = new Map([[0, mainCanvas]]);
    setIdle();
  };

  const execute = () => {
    const blocksActive = blocksMode && blocklyWorkspace && !workspaceIsEmpty(blocklyWorkspace);
    const raw = blocksActive ? getWorkspaceCode(blocklyWorkspace) : editor.getValue();

    if (/\bvision\b|__ar_video|ShaderFX\.camera/.test(raw) && !window.__ar_camera_on) {
      consoleEl.innerHTML = '<span class="err">Cannot run: camera is off. Turn on your camera first (<i class="fa-solid fa-video"></i> button in toolbar).</span>';
      showConsoleWin();
      return;
    }
    if (/\b__ar_mic_stream\b/.test(raw) && !window.__ar_mic_on) {
      consoleEl.innerHTML = '<span class="err">Cannot run: microphone is off. Turn on your mic first (<i class="fa-solid fa-microphone"></i> button in toolbar).</span>';
      showConsoleWin();
      return;
    }

    reset();
    showOutputWin();
    window.__ar_audioReady = startAudio();
    window.__ar_keepAlive = new Set();
    consoleEl.innerHTML = "";
    patchTimers();
    patchListeners();
    let protected_code;
    try {
      protected_code = addInfiniteLoopProtection(raw);
    } catch (_) {
      protected_code = raw;
    }

    const code =
      `(async function(){\nawait window.__ar_audioReady;\n${protected_code}\n})()` +
      `.catch(e => console.error("Error: " + window.__ar_friendlyError(e)))` +
      `.then(() => window.__ar_iifeDone?.());`;

    window.__ar_friendlyError = friendlyError;
    window.__ar_iifeDone = () => {
      if (btnState !== "running") return;
      const intervals = window.__ar_intervals ?? new Map();
      const listeners = window.__ar_listeners ?? [];
      const keepAlive = window.__ar_keepAlive ?? new Set();
      if (intervals.size === 0 && listeners.length === 0 && keepAlive.size === 0) setStopped();
    };

    setRunning();
    const script = document.createElement("script");
    try { script.appendChild(document.createTextNode(code)); } catch (e) { script.text = code; }
    document.body.appendChild(script);
    currentScript = script;
    startIdleWatcher();
  };

  // ── Sidebar toggle button ─────────────────────────────────────────────────
  const sidebarBtn = document.getElementById("sidebarBtn");
  let sidebarOpen = localStorage.getItem("vl-sidebar-open") !== "0";

  // ── Mode switching (text ↔ blocks) ───────────────────────────────────────
  const blocksArea = document.getElementById("blockly-area");
  const editorWrap = document.getElementById("editor-wrap");
  const textModeBtn = document.getElementById("textModeBtn");
  const blocksModeBtn = document.getElementById("blocksModeBtn");
  const modeThumb = document.querySelector(".mode-thumb");
  let blocksMode = false;
  blocksArea.style.display = "none";

  const positionThumb = (toBlocks) => {
    const opt = toBlocks ? blocksModeBtn : textModeBtn;
    const container = opt.closest("#modeToggle");
    const cr = container.getBoundingClientRect();
    const or = opt.getBoundingClientRect();
    modeThumb.style.left = (or.left - cr.left) + "px";
    modeThumb.style.width = or.width + "px";
  };

  const blockyCatPanel  = document.getElementById("blockly-categories");
  const blockyListPanel = document.getElementById("blockly-block-list");

  const applySidebar = () => {
    const toolkitWin = document.getElementById("win-toolkit");
    if (toolkitWin) toolkitWin.style.display = sidebarOpen ? "flex" : "none";
    document.getElementById("toolkit-body").style.display = blocksMode ? "none" : "block";
    blockyCatPanel.style.display  = blocksMode ? "block" : "none";
    blockyListPanel.style.display = "none";
    if (blocksMode && blocklyWorkspace) resizeBlockly(blocklyWorkspace);
    sidebarBtn.classList.toggle("active", sidebarOpen);
    editor.refresh();
    inlineWidgets.refresh();
  };

  const addBlockToWorkspace = (type, clientX, clientY) => {
    if (!blocklyWorkspace) return;
    const ws = blocklyWorkspace;
    const block = ws.newBlock(type);
    block.initSvg();
    block.render();
    const injectDiv = ws.getInjectionDiv();
    if (clientX != null) {
      const rect = injectDiv.getBoundingClientRect();
      block.moveTo({ x: (clientX - rect.left - ws.scrollX) / ws.scale, y: (clientY - rect.top - ws.scrollY) / ws.scale });
    } else {
      block.moveTo({ x: (-ws.scrollX + injectDiv.offsetWidth / 2) / ws.scale, y: (-ws.scrollY + injectDiv.offsetHeight / 2) / ws.scale });
    }
  };

  sidebarBtn.addEventListener("click", () => {
    sidebarOpen = !sidebarOpen;
    localStorage.setItem("vl-sidebar-open", sidebarOpen ? "1" : "0");
    applySidebar();
  });

  const openBlocks = () => {
    blocksMode = true;
    editorWrap.style.display = "none";
    blocksArea.style.display = "flex";
    blocksModeBtn.classList.add("active");
    textModeBtn.classList.remove("active");
    positionThumb(true);
    if (!blocklyWorkspace) {
      blocklyWorkspace = initBlockly(document.getElementById("blockly-div"));
      registerSidebarDeleteZone(blocklyWorkspace, document.getElementById("win-toolkit"));

      // Palette workspace — read-only Blockly view inside win-toolkit
      paletteWorkspace = initPaletteWorkspace(document.getElementById("blockly-palette"));
      onPaletteClick(paletteWorkspace, type => addBlockToWorkspace(type));

      const backBtn = document.getElementById("blockly-back-btn");
      backBtn.addEventListener("click", () => {
        blockyListPanel.style.display = "none";
        blockyCatPanel.style.display = "block";
      });

      for (const { name, hue, blocks } of TOOLBOX_CATEGORY_META) {
        const btn = document.createElement("button");
        btn.className = "blockly-cat-btn";
        btn.textContent = name;
        btn.style.background = `hsl(${hue}, 50%, 42%)`;
        btn.addEventListener("click", async () => {
          blockyCatPanel.style.display = "none";
          blockyListPanel.style.display = "flex";
          backBtn.textContent = "← " + name;
          paletteWorkspace.clear();
          const addedBlocks = [];
          for (const { type } of blocks) {
            const block = paletteWorkspace.newBlock(type);
            block.initSvg();
            block.render();
            addedBlocks.push(block);
          }
          await finishBlockRenders();
          let y = 10;
          for (const block of addedBlocks) {
            block.moveTo({ x: 10, y });
            y += block.getHeightWidth().height + 14;
          }
          resizeBlockly(paletteWorkspace);
          requestAnimationFrame(() => paletteWorkspace.scroll(0, 0));
        });
        blockyCatPanel.appendChild(btn);
      }
    }
    // Translate text → blocks when workspace is still empty
    if (workspaceIsEmpty(blocklyWorkspace)) {
      try {
        const json = jsToBlocks(editor.getValue());
        if (json) loadWorkspaceJSON(blocklyWorkspace, json);
      } catch (_) {}
    }
    applySidebar();
  };

  const closeBlocks = () => {
    if (blocklyWorkspace) {
      const code = workspaceIsEmpty(blocklyWorkspace) ? '' : getWorkspaceCode(blocklyWorkspace);
      editor.setValue(code);
      editor.setCursor(0);
    }
    blocksMode = false;
    blocksArea.style.display = "none";
    editorWrap.style.display = "";
    textModeBtn.classList.add("active");
    blocksModeBtn.classList.remove("active");
    positionThumb(false);
    applySidebar();
  };

  textModeBtn.addEventListener("click", () => { if (blocksMode) { closeBlocks(); localStorage.setItem("vl-blocks-open", "0"); } });
  blocksModeBtn.addEventListener("click", () => { if (!blocksMode) { openBlocks(); localStorage.setItem("vl-blocks-open", "1"); } });

  new ResizeObserver(() => {
    if (blocklyWorkspace && blocksArea.style.display !== "none") resizeBlockly(blocklyWorkspace);
    if (paletteWorkspace && blockyListPanel.style.display === "flex") resizeBlockly(paletteWorkspace);
  }).observe(blocksArea);

  // ── Button handlers ───────────────────────────────────────────────────────
  clearCanvasBtn.addEventListener("click", () => {
    for (const c of window.__ar_layers.values()) {
      c.getContext("2d").clearRect(0, 0, c.width, c.height);
    }
  });

  executeBtn.addEventListener("click", () => {
    if (btnState === "idle") execute();
    else if (btnState === "running") pauseRunning();
    else if (btnState === "paused") resumeRunning();
    else reset();
  });

  stopBtn.addEventListener("click", () => {
    if (btnState === "running" || btnState === "paused") stopRunning();
  });

  // ── Help modal ────────────────────────────────────────────────────────────
  const helpOverlay = document.getElementById("help-overlay");
  const helpBtn = document.getElementById("helpBtn");
  const helpClose = document.getElementById("help-close");

  const toggleHelp = () => {
    const open = helpOverlay.style.display !== "none";
    helpOverlay.style.display = open ? "none" : "block";
    helpBtn.classList.toggle("active", !open);
  };

  helpBtn.addEventListener("click", toggleHelp);
  helpClose.addEventListener("click", () => { helpOverlay.style.display = "none"; helpBtn.classList.remove("active"); });
  helpOverlay.addEventListener("click", (e) => { if (e.target === helpOverlay) { helpOverlay.style.display = "none"; helpBtn.classList.remove("active"); } });
  document.addEventListener("keydown", (e) => {
    if (e.key === "?" && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA" && !document.activeElement?.classList.contains("CodeMirror-code")) toggleHelp();
    if (e.key === "Escape" && helpOverlay.style.display !== "none") { helpOverlay.style.display = "none"; helpBtn.classList.remove("active"); }
  });

  // ── Window manager ────────────────────────────────────────────────────────
  window.wm = initWM(() => {
    editor.refresh();
    inlineWidgets.refresh();
    if (blocklyWorkspace && blocksArea.style.display !== "none") resizeBlockly(blocklyWorkspace);
  });

  // ── Built-in windows (created via WM so they get dup/close/etc.) ─────────
  const _stage = document.getElementById('wm-stage');

  function _adoptContent(winId, contentId, bodyStyle = {}) {
    const win = document.getElementById(winId);
    const body = win.querySelector('.wm-body');
    Object.assign(body.style, bodyStyle);
    const content = document.getElementById(contentId);
    body.appendChild(content);
    win._wmRescueContent = () => _stage.appendChild(content);
  }

  window.wm.registerBuiltin('win-toolkit', () => {
    window.wm.spawn('API Toolbox', { id: 'win-toolkit', type: 'html', html: '' });
    _adoptContent('win-toolkit', 'toolkit-panel');
    document.getElementById('win-toolkit').querySelector('.wm-dup')?.remove();
  });

  window.wm.registerBuiltin('win-editor', () => {
    window.wm.spawn('Editor', { id: 'win-editor', type: 'html', html: '' });
    _adoptContent('win-editor', 'editor-column');
    document.getElementById('win-editor').querySelector('.wm-dup')?.remove();
    new ResizeObserver(() => {
      editor.refresh();
      inlineWidgets.refresh();
      if (blocklyWorkspace && blocksArea.style.display !== "none") resizeBlockly(blocklyWorkspace);
    }).observe(document.getElementById('win-editor'));
  });

  window.wm.registerBuiltin('win-canvas', () => {
    window.wm.spawn('Output', { id: 'win-canvas', type: 'html', html: '' });
    _adoptContent('win-canvas', 'fsContainer', { flexDirection: 'column' });
    document.getElementById('win-canvas')._wmSpawnOpts = { title: 'Output mirror', type: 'canvas', z: 0 };
  });

  window.wm.registerBuiltin('win-camera', () => {
    window.wm.spawn('Camera', { id: 'win-camera', type: 'html', html: '' });
    const win = document.getElementById('win-camera');
    const body = win.querySelector('.wm-body');
    body.style.background = '#000';
    const cam = document.getElementById('camera');
    body.appendChild(cam);
    win._wmRescueContent = () => _stage.appendChild(cam);
    win._wmSpawnOpts = { title: 'Camera mirror', type: 'camera' };
    win.querySelector('.wm-audio-ctrl')?.remove();
    win.style.display = 'none';
  });

  window.wm.registerBuiltin('win-mic', () => {
    window.wm.spawn('Mic', { id: 'win-mic', type: 'html', html: '' });
    _adoptContent('win-mic', 'mic-viz-wrap', { background: '#111' });
    document.getElementById('win-mic').querySelector('.wm-dup')?.remove();
    document.getElementById('win-mic').style.display = 'none';
  });

  window.wm.registerBuiltin('win-console', () => {
    window.wm.spawn('Console', { id: 'win-console', type: 'html', html: '' });
    _adoptContent('win-console', 'console-wrap');
    document.getElementById('win-console').querySelector('.wm-dup')?.remove();
    document.getElementById('win-console').style.display = 'none';
  });

  ['win-toolkit', 'win-editor', 'win-canvas', 'win-camera', 'win-mic', 'win-console']
    .forEach(id => window.wm.createBuiltin(id));

  new ResizeObserver(() => {
    if (paletteWorkspace && blockyListPanel.style.display === "flex") resizeBlockly(paletteWorkspace);
  }).observe(document.getElementById("win-toolkit"));

  const filesBtn = document.getElementById('filesBtn');
  let _filesBrowseWinId = null;
  filesBtn?.addEventListener('click', async () => {
    // If window still in DOM, just focus it
    if (_filesBrowseWinId && document.getElementById(_filesBrowseWinId)) {
      window.wm.focus(_filesBrowseWinId);
      return;
    }
    const imageExts = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','ico']);
    const videoExts = new Set(['mp4','webm','mov','avi','mkv']);
    const audioExts = new Set(['mp3','wav','ogg','flac','aac','m4a']);
    try {
      _filesBrowseWinId = await window.wm.browse('__nav_files__', (url, name) => {
        const ext = name.split('.').pop().toLowerCase();
        if (imageExts.has(ext)) {
          window.wm.spawn(name, { type: 'image', src: url, w: 480, h: 360 });
        } else if (videoExts.has(ext)) {
          window.wm.spawn(name, { type: 'video', src: url, w: 640, h: 480, controls: true });
        } else if (audioExts.has(ext)) {
          const a = new Audio(url);
          a.controls = true;
          const id = window.wm.spawn(name, { type: 'html', html: '', w: 320, h: 60 });
          const body = document.getElementById(id)?.querySelector('.wm-body');
          if (body) { body.style.alignItems = 'center'; body.style.padding = '4px 8px'; body.appendChild(a); a.play(); }
        } else {
          _log('[files]', name, url);
        }
      });
      // Deactivate button once window is closed via its X
      const observer = new MutationObserver(() => {
        if (!document.getElementById(_filesBrowseWinId)) {
          _filesBrowseWinId = null;
          observer.disconnect();
        }
      });
      observer.observe(document.getElementById('desktop'), { childList: true });
    } catch (_) { /* user cancelled picker */ }
  });

  window.wm.layout('split');

  if (localStorage.getItem("vl-blocks-open") === "1") {
    openBlocks();
  } else {
    applySidebar();
  }
  requestAnimationFrame(() => positionThumb(blocksMode));
};
