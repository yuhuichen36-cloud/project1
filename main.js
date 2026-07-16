/**
 * AETHER-2 · Character Terminal
 * Preview grid · independent cols/rows · knit · color mode
 */

const CHARSETS = {
  classic: " .:-=+*#%@",
  knit: " .'`˚∘○◎◍●",
  dot: " ·•●",
  wire: " ·/\\|-+#",
};

const MODE_LABELS = {
  classic: "经典",
  knit: "线圈",
  dot: "点阵",
  wire: "线框",
};

const MAX_DPR = 2;
const TARGET_FPS_IDLE = 18;
const TARGET_FPS_PLAY = 28;

const state = {
  cols: 72,
  rows: 42,
  zoom: 1,
  contrast: 125,
  render: "char",
  charset: "classic",
  invert: false,
  dither: true,
  glow: true,
  tone: "green",
  playing: false,
  hasSignal: false,
  source: null,
};

const els = {
  canvas: document.getElementById("screen"),
  crt: document.getElementById("crt"),
  cols: document.getElementById("cols"),
  colsVal: document.getElementById("cols-val"),
  rows: document.getElementById("rows"),
  rowsVal: document.getElementById("rows-val"),
  zoom: document.getElementById("zoom"),
  zoomVal: document.getElementById("zoom-val"),
  contrast: document.getElementById("contrast"),
  contrastVal: document.getElementById("contrast-val"),
  invert: document.getElementById("invert"),
  dither: document.getElementById("dither"),
  glow: document.getElementById("glow"),
  knob: document.getElementById("knob"),
  knobFace: document.querySelector(".knob-face"),
  play: document.getElementById("btn-play"),
  status: document.getElementById("status-line"),
  signalText: document.getElementById("signal-text"),
  signalBars: document.getElementById("signal-bars"),
  fileImage: document.getElementById("file-image"),
  fileVideo: document.getElementById("file-video"),
};

if (!els.canvas) {
  throw new Error("AETHER-2: #screen canvas missing");
}

const ctx = els.canvas.getContext("2d", { alpha: false, desynchronized: true });
ctx.imageSmoothingEnabled = false;

const sampleCanvas = document.createElement("canvas");
const sampleCtx = sampleCanvas.getContext("2d", {
  willReadFrequently: true,
  alpha: false,
});

let last = performance.now();
let animT = 0;
let lastStatus = 0;

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function clampByte(n) {
  return n < 0 ? 0 : n > 255 ? 255 : n | 0;
}

function activeGrid() {
  return {
    cols: Math.max(8, state.cols | 0),
    rows: Math.max(8, state.rows | 0),
  };
}

function sampleDemo(u, v, t) {
  const x = (u - 0.5) * state.zoom;
  const y = (v - 0.5) * state.zoom;
  const r = Math.hypot(x, y);
  const angle = Math.atan2(y, x);
  let n =
    0.55 +
    0.25 * Math.sin(r * 18 - t * 0.8) +
    0.15 * Math.sin(angle * 5 + t * 0.4) +
    0.12 * Math.sin(x * 22 + y * 14 + t * 0.6);
  n += 0.08 * Math.sin((x * x + y * y) * 40 - t);
  return clamp01(n);
}

/** Demo RGB when no source + color mode */
function sampleDemoColor(u, v, t) {
  const x = (u - 0.5) * state.zoom;
  const y = (v - 0.5) * state.zoom;
  const r = Math.hypot(x, y);
  const hue = (angleNorm(Math.atan2(y, x)) + t * 0.08 + r * 0.35) % 1;
  const sat = 0.55 + 0.35 * Math.sin(r * 10 - t);
  const val = sampleDemo(u, v, t);
  return hsvToRgb(hue, clamp01(sat), clamp01(0.35 + val * 0.65));
}

function angleNorm(a) {
  return (a + Math.PI) / (Math.PI * 2);
}

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r;
  let g;
  let b;
  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    default:
      r = v;
      g = p;
      b = q;
  }
  return { r: clampByte(r * 255), g: clampByte(g * 255), b: clampByte(b * 255) };
}

function samplePixel(data, cols, col, row) {
  const i = (row * cols + col) * 4;
  return {
    r: data[i],
    g: data[i + 1],
    b: data[i + 2],
    lum: (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255,
  };
}

function applyContrast(v, contrast) {
  return clamp01((v - 0.5) * (contrast / 100) + 0.5);
}

function applyContrastRgb(c, contrast) {
  const k = contrast / 100;
  return {
    r: clampByte(((c.r / 255 - 0.5) * k + 0.5) * 255),
    g: clampByte(((c.g / 255 - 0.5) * k + 0.5) * 255),
    b: clampByte(((c.b / 255 - 0.5) * k + 0.5) * 255),
  };
}

function invertRgb(c) {
  return { r: 255 - c.r, g: 255 - c.g, b: 255 - c.b };
}

function bayerDither(x, y, v) {
  const m = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const threshold = (m[y & 3][x & 3] + 0.5) / 16;
  return v > threshold ? Math.min(1, v + 0.08) : Math.max(0, v - 0.08);
}

function pickChar(v, set) {
  const chars = CHARSETS[set] || CHARSETS.classic;
  const idx = Math.min(chars.length - 1, (v * chars.length) | 0);
  return chars.charAt(idx);
}

function toneColors() {
  switch (state.tone) {
    case "amber":
      return { bg: "#140e08", fg: { r: 212, g: 165, b: 116 }, colorMode: false };
    case "paper":
      return { bg: "#e8e2d4", fg: { r: 42, g: 40, b: 36 }, colorMode: false };
    case "color":
      return { bg: "#0a0a0c", fg: { r: 220, g: 220, b: 220 }, colorMode: true };
    default:
      return { bg: "#0c120e", fg: { r: 143, g: 170, b: 130 }, colorMode: false };
  }
}

function rgbaFrom(rgb, a) {
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

function resizeCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const w = Math.max(280, Math.floor(rect.width * dpr));
  const h = Math.max(220, Math.floor(rect.height * dpr));
  if (els.canvas.width !== w || els.canvas.height !== h) {
    els.canvas.width = w;
    els.canvas.height = h;
    ctx.imageSmoothingEnabled = false;
  }
}

function prepareSampleBuffer(cols, rows) {
  if (!state.source) return null;

  if (sampleCanvas.width !== cols || sampleCanvas.height !== rows) {
    sampleCanvas.width = cols;
    sampleCanvas.height = rows;
  }

  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.fillStyle = "#000";
  sampleCtx.fillRect(0, 0, cols, rows);

  const src = state.source;
  if (src instanceof HTMLVideoElement) {
    if (src.readyState < 2) return null;
    sampleCtx.drawImage(src, 0, 0, cols, rows);
  } else {
    const iw = src.width;
    const ih = src.height;
    const scale = Math.min(cols / iw, rows / ih) * state.zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    sampleCtx.drawImage(src, (cols - dw) / 2, (rows - dh) / 2, dw, dh);
  }

  return sampleCtx.getImageData(0, 0, cols, rows);
}

/** Returns { lum, rgb } for one cell */
function sampleCell(imgData, col, row, cols, rows, t, colorMode) {
  const u = (col + 0.5) / cols;
  const v = (row + 0.5) / rows;
  let rgb;
  let lum;

  if (imgData) {
    const px = samplePixel(imgData.data, cols, col, row);
    rgb = { r: px.r, g: px.g, b: px.b };
    lum = px.lum;
  } else if (colorMode) {
    rgb = sampleDemoColor(u, v, t);
    lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  } else {
    lum = sampleDemo(u, v, t);
    rgb = null;
  }

  lum = applyContrast(lum, state.contrast);
  if (state.dither) lum = bayerDither(col, row, lum);
  if (state.invert) lum = 1 - lum;

  if (rgb) {
    rgb = applyContrastRgb(rgb, state.contrast);
    if (state.invert) rgb = invertRgb(rgb);
  }

  const dx = u - 0.5;
  const dy = v - 0.5;
  const vig = 1 - Math.min(1, (dx * dx + dy * dy) * 1.2);
  const vigK = 0.78 + 0.22 * vig;
  lum *= vigK;
  if (rgb) {
    rgb = {
      r: clampByte(rgb.r * vigK),
      g: clampByte(rgb.g * vigK),
      b: clampByte(rgb.b * vigK),
    };
  }

  return { lum, rgb };
}

function cellInk(colors, cell, alpha) {
  if (colors.colorMode && cell.rgb) {
    return rgbaFrom(cell.rgb, alpha);
  }
  return rgbaFrom(colors.fg, alpha);
}

/**
 * @param {number} t
 * @param {{ showGrid?: boolean }} [opts]
 */
function drawFrame(t, opts = {}) {
  const showGrid = opts.showGrid !== false;
  resizeCanvas();
  const W = els.canvas.width;
  const H = els.canvas.height;
  const colors = toneColors();
  const { cols, rows } = activeGrid();
  const cellW = W / cols;
  const cellH = H / rows;
  const fontSize = Math.max(6, Math.floor(Math.min(cellW * 0.92, cellH * 0.78)));
  const imgData = prepareSampleBuffer(cols, rows);
  const isTexture = state.render === "texture";
  const charset = state.charset;
  const isPaper = state.tone === "paper";
  const colorMode = colors.colorMode;

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);

  const gap = showGrid ? Math.max(1, Math.floor(Math.min(cellW, cellH) * 0.08)) : 0;
  const gridA = isPaper ? 0.12 : colorMode ? 0.1 : 0.16;

  ctx.font = `${fontSize}px ui-monospace, "IBM Plex Mono", Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 1;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = sampleCell(imgData, col, row, cols, rows, t, colorMode);
      const { lum } = cell;
      const x0 = Math.floor(col * cellW) + gap;
      const y0 = Math.floor(row * cellH) + gap;
      const cw = Math.max(1, Math.floor(cellW) - gap * 2);
      const ch = Math.max(1, Math.floor(cellH) - gap * 2);
      const cx = x0 + (cw >> 1);
      const cy = y0 + (ch >> 1);

      if (showGrid) {
        ctx.strokeStyle = cellInk(colors, cell, gridA);
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, cw, ch);
        ctx.fillStyle = cellInk(
          colors,
          cell,
          (isPaper ? 0.05 : 0.07) + lum * (isPaper ? 0.12 : 0.18)
        );
        ctx.fillRect(x0 + 1, y0 + 1, Math.max(1, cw - 2), Math.max(1, ch - 2));
      }

      if (isTexture) {
        ctx.fillStyle = cellInk(colors, cell, 0.35 + lum * 0.65);
        const size = Math.max(1, Math.round(Math.min(cw, ch) * (0.25 + lum * 0.55)));
        if (charset === "dot") {
          ctx.beginPath();
          ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
          ctx.fill();
        } else if (charset === "wire") {
          ctx.fillRect(cx - (size >> 1), cy, size, 1);
          ctx.fillRect(cx, cy - (size >> 1), 1, size);
        } else if (charset === "knit") {
          // Loopy knit: concentric rings
          ctx.beginPath();
          ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
          ctx.strokeStyle = cellInk(colors, cell, 0.35 + lum * 0.65);
          ctx.lineWidth = Math.max(1, size * 0.18);
          ctx.stroke();
          ctx.lineWidth = 1;
          if (lum > 0.45) {
            ctx.beginPath();
            ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          ctx.fillRect(cx - (size >> 1), cy - (size >> 1), size, size);
        }
      } else {
        const glyph = pickChar(lum, charset);
        if (glyph !== " ") {
          ctx.fillStyle = cellInk(colors, cell, 0.45 + lum * 0.55);
          ctx.fillText(glyph, cx, cy);
        }
      }
    }
  }
}

function computeFrame(t, W, H) {
  const colors = toneColors();
  const { cols, rows } = activeGrid();
  const cellW = W / cols;
  const cellH = H / rows;
  const fontSize = Math.max(6, Math.floor(Math.min(cellW * 0.92, cellH * 0.78)));
  const imgData = prepareSampleBuffer(cols, rows);
  const isTexture = state.render === "texture";
  const charset = state.charset;
  const colorMode = colors.colorMode;
  const cells = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sampled = sampleCell(imgData, col, row, cols, rows, t, colorMode);
      const lum = sampled.lum;
      const x = Math.floor((col + 0.5) * cellW);
      const y = Math.floor((row + 0.5) * cellH);
      const ink = colorMode && sampled.rgb ? sampled.rgb : colors.fg;

      if (isTexture) {
        let shape = "block";
        if (charset === "dot") shape = "dot";
        else if (charset === "wire") shape = "wire";
        else if (charset === "knit") shape = "knit";
        const size = Math.max(
          1,
          Math.round(Math.min(cellW, cellH) * (0.25 + lum * 0.55))
        );
        cells.push({
          mode: "texture",
          x,
          y,
          a: 0.35 + lum * 0.65,
          size,
          shape,
          ink,
        });
      } else {
        cells.push({
          mode: "char",
          x,
          y,
          a: 0.45 + lum * 0.55,
          ch: pickChar(lum, charset),
          ink,
        });
      }
    }
  }

  return { cols, rows, fontSize, colors, cells };
}

function updateStatus() {
  els.status.textContent = `列: ${state.cols}  行: ${String(state.rows).padStart(2, "0")}  模式: ${MODE_LABELS[state.charset]}  通道 02 — 9600 波特`;
}

function updateSignal() {
  if (state.hasSignal) {
    els.signalText.textContent = "有信号";
    els.signalBars.classList.add("has-signal");
  } else {
    els.signalText.textContent = "无信号";
    els.signalBars.classList.remove("has-signal");
  }
}

function setZoom(value) {
  state.zoom = Math.round(Math.max(0.5, Math.min(2, value)) * 100) / 100;
  els.zoom.value = String(Math.round(state.zoom * 100));
  els.zoomVal.textContent = state.zoom.toFixed(2);
  const angle = ((state.zoom - 0.5) / 1.5) * 270 - 135;
  els.knobFace.style.transform = `rotate(${angle}deg)`;
  els.knob.setAttribute("aria-valuenow", String(state.zoom));
}

/* ─── Controls ─── */
document.querySelectorAll("[data-press]").forEach((btn) => {
  btn.addEventListener("pointerdown", () => btn.classList.add("is-pressed"));
  btn.addEventListener("pointerup", () => btn.classList.remove("is-pressed"));
  btn.addEventListener("pointerleave", () => btn.classList.remove("is-pressed"));
  btn.addEventListener("pointercancel", () => btn.classList.remove("is-pressed"));
});

els.cols.addEventListener("input", () => {
  state.cols = Number(els.cols.value);
  els.colsVal.textContent = String(state.cols);
  updateStatus();
});

els.rows.addEventListener("input", () => {
  state.rows = Number(els.rows.value);
  els.rowsVal.textContent = String(state.rows);
  updateStatus();
});

els.zoom.addEventListener("input", () => setZoom(Number(els.zoom.value) / 100));

els.contrast.addEventListener("input", () => {
  state.contrast = Number(els.contrast.value);
  els.contrastVal.textContent = String(state.contrast);
});

(function initKnob() {
  let dragging = false;
  let startY = 0;
  let startZoom = 1;

  els.knob.addEventListener("pointerdown", (e) => {
    dragging = true;
    startY = e.clientY;
    startZoom = state.zoom;
    els.knob.setPointerCapture(e.pointerId);
  });
  els.knob.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    setZoom(startZoom + (startY - e.clientY) * 0.008);
  });
  els.knob.addEventListener("pointerup", () => {
    dragging = false;
  });
  els.knob.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      setZoom(state.zoom + 0.05);
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      setZoom(state.zoom - 0.05);
    }
  });
})();

document.querySelectorAll("[data-render]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-render]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.render = btn.dataset.render;
  });
});

document.querySelectorAll("[data-charset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-charset]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.charset = btn.dataset.charset;
    updateStatus();
  });
});

document.querySelectorAll("[data-tone]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-tone]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.tone = btn.dataset.tone;
    els.crt.dataset.tone = state.tone;
  });
});

els.invert.addEventListener("change", () => {
  state.invert = els.invert.checked;
});
els.dither.addEventListener("change", () => {
  state.dither = els.dither.checked;
});
els.glow.addEventListener("change", () => {
  state.glow = els.glow.checked;
  els.crt.dataset.glow = state.glow ? "on" : "off";
});

document.getElementById("btn-load-image").addEventListener("click", () => els.fileImage.click());
document.getElementById("btn-load-video").addEventListener("click", () => els.fileVideo.click());

els.fileImage.addEventListener("change", async () => {
  const file = els.fileImage.files?.[0];
  if (!file) return;
  stopVideo();
  try {
    state.source = await createImageBitmap(file);
    state.hasSignal = true;
    updateSignal();
  } catch {
    const img = new Image();
    img.onload = () => {
      state.source = img;
      state.hasSignal = true;
      updateSignal();
    };
    img.src = URL.createObjectURL(file);
  }
});

els.fileVideo.addEventListener("change", () => {
  const file = els.fileVideo.files?.[0];
  if (!file) return;
  stopVideo();
  const video = document.createElement("video");
  video.src = URL.createObjectURL(file);
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.addEventListener("loadeddata", () => {
    state.source = video;
    state.hasSignal = true;
    updateSignal();
    if (state.playing) video.play().catch(() => {});
  });
});

function stopVideo() {
  if (state.source instanceof HTMLVideoElement) {
    state.source.pause();
    try {
      URL.revokeObjectURL(state.source.src);
    } catch (_) {}
  }
}

els.play.addEventListener("click", () => {
  state.playing = !state.playing;
  els.play.classList.toggle("is-playing", state.playing);
  els.play.querySelector(".play-icon path")?.setAttribute(
    "d",
    state.playing ? "M7 6h3v12H7V6zm7 0h3v12h-3V6z" : "M8 5.5v13l11-6.5-11-6.5z"
  );

  if (state.source instanceof HTMLVideoElement) {
    if (state.playing) state.source.play().catch(() => {});
    else state.source.pause();
  }

  if (!state.source) {
    state.hasSignal = state.playing;
    updateSignal();
  }
});

/* ─── Export (no reference grid) ─── */
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function exportRaster(format) {
  drawFrame(animT, { showGrid: false });
  const mime = format === "jpg" ? "image/jpeg" : "image/png";
  const quality = format === "jpg" ? 0.92 : undefined;
  els.canvas.toBlob(
    (blob) => {
      if (blob) downloadBlob(blob, `aether-2-${stamp()}.${format === "jpg" ? "jpg" : "png"}`);
    },
    mime,
    quality
  );
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function exportSvg() {
  resizeCanvas();
  const W = els.canvas.width;
  const H = els.canvas.height;
  const { fontSize, colors, cells } = computeFrame(animT, W, H);
  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="100%" height="100%" fill="${colors.bg}"/>`,
    `<g font-family="ui-monospace,monospace" font-size="${fontSize}" text-anchor="middle" dominant-baseline="central">`,
  ];

  for (const cell of cells) {
    const fill = rgbaFrom(cell.ink, cell.a);
    if (cell.mode === "texture") {
      if (cell.shape === "dot") {
        parts.push(
          `<circle cx="${cell.x}" cy="${cell.y}" r="${(cell.size * 0.42).toFixed(2)}" fill="${fill}"/>`
        );
      } else if (cell.shape === "wire") {
        parts.push(
          `<rect x="${cell.x - (cell.size >> 1)}" y="${cell.y}" width="${cell.size}" height="1" fill="${fill}"/>`
        );
        parts.push(
          `<rect x="${cell.x}" y="${cell.y - (cell.size >> 1)}" width="1" height="${cell.size}" fill="${fill}"/>`
        );
      } else if (cell.shape === "knit") {
        parts.push(
          `<circle cx="${cell.x}" cy="${cell.y}" r="${(cell.size * 0.48).toFixed(2)}" fill="none" stroke="${fill}" stroke-width="${Math.max(1, cell.size * 0.18).toFixed(2)}"/>`
        );
        if (cell.a > 0.55) {
          parts.push(
            `<circle cx="${cell.x}" cy="${cell.y}" r="${(cell.size * 0.22).toFixed(2)}" fill="${fill}"/>`
          );
        }
      } else {
        parts.push(
          `<rect x="${cell.x - (cell.size >> 1)}" y="${cell.y - (cell.size >> 1)}" width="${cell.size}" height="${cell.size}" fill="${fill}"/>`
        );
      }
    } else if (cell.ch && cell.ch !== " ") {
      parts.push(
        `<text x="${cell.x}" y="${cell.y}" fill="${fill}">${escapeXml(cell.ch)}</text>`
      );
    }
  }

  parts.push(`</g></svg>`);
  downloadBlob(
    new Blob([parts.join("\n")], { type: "image/svg+xml;charset=utf-8" }),
    `aether-2-${stamp()}.svg`
  );
}

document.getElementById("btn-export-png")?.addEventListener("click", () => exportRaster("png"));
document.getElementById("btn-export-jpg")?.addEventListener("click", () => exportRaster("jpg"));
document.getElementById("btn-export-svg")?.addEventListener("click", () => exportSvg());

/* ─── Render loop ─── */
function loop(now) {
  const fps = state.playing ? TARGET_FPS_PLAY : TARGET_FPS_IDLE;
  const interval = 1000 / fps;
  const elapsed = now - last;

  if (elapsed >= interval) {
    const dt = Math.min(0.08, elapsed / 1000);
    last = now - (elapsed % interval);

    if (state.playing || !state.source) {
      animT += dt * (state.playing ? 1.2 : 0.28);
    }

    try {
      drawFrame(animT, { showGrid: true });
    } catch (err) {
      console.error("AETHER-2 draw error", err);
    }

    if (now - lastStatus > 400) {
      updateStatus();
      lastStatus = now;
    }
  }

  requestAnimationFrame(loop);
}

setZoom(1);
els.crt.dataset.glow = "on";
els.cols.value = String(state.cols);
els.colsVal.textContent = String(state.cols);
els.rows.value = String(state.rows);
els.rowsVal.textContent = String(state.rows);
updateSignal();
updateStatus();
requestAnimationFrame(loop);

window.addEventListener("resize", () => {
  resizeCanvas();
  updateStatus();
});
