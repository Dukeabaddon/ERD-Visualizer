import * as vscode from 'vscode';
import { SchemaModel } from './model';
import { AutoLayoutMap } from './layout';

export function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  model: SchemaModel,
  _visualSpec?: unknown,
  savedLayout?: any,
  autoLayout?: AutoLayoutMap,
  themePreference: string = 'system',
): string {
  const nonce = getNonce();
  const payload = {
    model,
    savedLayout: savedLayout || null,
    autoLayout: autoLayout || {},
    themePreference,
  };
  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
  const htmlToImageUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'vendor', 'html-to-image.min.js')).toString();
  const pdfLibUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'vendor', 'pdf-lib.min.js')).toString();
  const keyIconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'key.svg')).toString();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; font-src data:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ERD Visualizer</title>
  <style>
    :root {
      --canvas-bg-dark: #050f1d;
      --canvas-bg-light: #f5f7fb;
      --grid-dark: rgba(255,255,255,0.05);
      --grid-light: rgba(12,24,64,0.08);
      --text-dark: #f7fbff;
      --text-light: #111a2c;
      --muted-dark: #9fb4d7;
      --muted-light: #4d5a78;
      --edge-stroke-dark: #8ca2c7;
      --edge-stroke-light: #5c6f91;
      --edge-highlight-dark: #a8e2ff;
      --edge-highlight-light: #4d8dff;
      --edge-anchor-dark: rgba(255,255,255,0.8);
      --edge-anchor-light: rgba(8,19,32,0.7);
      --focus-dim-opacity: 0.28;
      --focus-shadow-dark: rgba(0,0,0,0.45);
      --focus-shadow-light: rgba(8,19,32,0.3);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      height: 100vh;
      width: 100vw;
      font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      color: var(--text-dark);
      background: var(--canvas-bg-dark);
      overflow: hidden;
      user-select: none;
    }
    body[data-theme='light'] {
      color: var(--text-light);
      background: var(--canvas-bg-light);
    }
    #app { position: relative; height: 100%; width: 100%; }
    #canvas {
      position: absolute;
      inset: 0;
      background-size: 24px 24px;
      background-image:
        linear-gradient(0deg, transparent 23px, rgba(255,255,255,0.04) 24px),
        linear-gradient(90deg, transparent 23px, rgba(255,255,255,0.04) 24px);
    }
    body[data-theme='light'] #canvas {
      background-image:
        linear-gradient(0deg, transparent 23px, rgba(24,38,74,0.05) 24px),
        linear-gradient(90deg, transparent 23px, rgba(24,38,74,0.05) 24px);
    }
    #viewport { position: absolute; transform-origin: 0 0; }
    #focusBackdrop {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: radial-gradient(circle at center, rgba(0,0,0,0.05), rgba(0,0,0,0.35));
      opacity: 0;
      transition: opacity 150ms ease;
    }
    body[data-theme='light'] #focusBackdrop {
      background: radial-gradient(circle at center, rgba(8,19,32,0.05), rgba(8,19,32,0.25));
    }
    body.focus-mode #focusBackdrop { opacity: var(--focus-dim-opacity); }
    #edges { position: absolute; inset: 0; overflow: visible; pointer-events: visibleStroke; }
    #edgeLabels { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
    #nodes { position: absolute; inset: 0; }
    .entity-card {
      position: absolute;
      min-width: 320px;
      border-radius: 12px;
      box-shadow: 0 16px 40px rgba(0,0,0,0.35);
      border: 1px solid var(--entity-border, rgba(255,255,255,0.2));
      background: var(--entity-body, #0a1626ee);
      color: inherit;
      cursor: grab;
      transition: box-shadow 0.15s ease;
      overflow: hidden;
    }
    body[data-theme='light'] .entity-card { box-shadow: 0 10px 24px rgba(10,24,48,0.15); }
    .entity-card:active { cursor: grabbing; }
    .entity-card.selected { box-shadow: 0 20px 48px rgba(49,155,255,0.35); }
    .entity-card[data-focus-role="primary"] { box-shadow: 0 24px 64px rgba(121,198,255,0.55); z-index: 3; }
    .entity-card[data-focus-role="neighbor"] { box-shadow: 0 18px 48px rgba(111,198,255,0.35); }
    .entity-card[data-focus-role="dimmed"] { opacity: 0.28; filter: saturate(0.5); }
    .entity-card.edge-hover {
      box-shadow: 0 0 24px rgba(111,198,255,0.45);
      border-color: rgba(111,198,255,0.8);
      opacity: 1 !important;
      filter: none !important;
    }
    .entity-card.keyboard-preview { box-shadow: 0 0 20px rgba(111,198,255,0.4); }
    .entity-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      background: var(--entity-header, rgba(255,255,255,0.04));
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 0.08em;
    }
    body[data-theme='light'] .entity-header { color: var(--text-light); }
    .entity-header .name { font-size: 15px; text-transform: none; letter-spacing: 0.02em; }
    .entity-columns { padding: 10px 0; }
    .column-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      align-items: center;
      padding: 6px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      font-size: 12px;
      gap: 8px;
    }
    body[data-theme='light'] .column-row { border-bottom-color: rgba(8,19,32,0.08); }
    .column-row:last-child { border-bottom: none; }
    .col-name {
      padding: 4px 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .col-type {
      justify-self: end;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted-dark);
    }
    body[data-theme='light'] .col-type { color: var(--muted-light); }
    .col-flags {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      justify-self: end;
    }
    .flag-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted-dark);
    }
    body[data-theme='light'] .flag-badge { color: var(--muted-light); }
    .flag-badge img {
      width: 10px;
      height: 10px;
      filter: brightness(1.4);
    }
    #toolbar {
      position: absolute;
      top: 18px;
      right: 18px;
      display: flex;
      gap: 8px;
      z-index: 30;
    }
    .toolbar-button {
      border: none;
      border-radius: 999px;
      padding: 8px 16px;
      background: rgba(255,255,255,0.08);
      color: inherit;
      font-size: 13px;
      cursor: pointer;
      backdrop-filter: blur(8px);
      transition: background 0.15s ease;
    }
    body[data-theme='light'] .toolbar-button { background: rgba(8,19,32,0.08); }
    .toolbar-button:hover { background: rgba(255,255,255,0.18); }
    body[data-theme='light'] .toolbar-button:hover { background: rgba(8,19,32,0.14); }
    #settingsToggle {
      width: 38px;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      padding: 0;
    }
    #settingsMenu {
      position: absolute;
      top: 60px;
      right: 0;
      width: 260px;
      background: rgba(5,14,25,0.96);
      border-radius: 14px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.35);
      padding: 16px;
      display: none;
      gap: 14px;
      color: inherit;
    }
    body[data-theme='light'] #settingsMenu { background: rgba(248,250,254,0.98); box-shadow: 0 16px 32px rgba(8,19,32,0.12); }
    #settingsMenu.active { display: flex; flex-direction: column; }
    .settings-section { border-bottom: 1px solid rgba(255,255,255,0.07); padding-bottom: 12px; }
    body[data-theme='light'] .settings-section { border-bottom-color: rgba(8,19,32,0.08); }
    .settings-section:last-child { border-bottom: none; }
    .radio-row { display: flex; gap: 8px; align-items: center; font-size: 13px; }
    .menu-button {
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      padding: 8px 12px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 13px;
    }
    body[data-theme='light'] .menu-button { border-color: rgba(8,19,32,0.12); }
    .menu-button.primary { background: linear-gradient(120deg, #3f8df5, #64d4ff); border: none; color: #fff; }
    #exportOptions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    #exportOptions select {
      width: 100%;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.15);
      padding: 6px;
      background: rgba(255,255,255,0.05);
      color: inherit;
    }
    body[data-theme='light'] #exportOptions select { border-color: rgba(8,19,32,0.1); background: rgba(8,19,32,0.04); }
    .edge-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      paint-order: stroke;
      stroke: rgba(5,5,5,0.35);
      stroke-width: 2px;
    }
    .edge-label.label-hover,
    .edge-label.label-focused {
      fill: var(--edge-highlight-dark);
      opacity: 1 !important;
    }
    body[data-theme='light'] .edge-label.label-hover,
    body[data-theme='light'] .edge-label.label-focused {
      fill: var(--edge-highlight-light);
    }
    .edge-label.label-dimmed { opacity: 0.25; }
    .edge-pipe {
      pointer-events: stroke;
      transition: stroke 120ms ease, opacity 120ms ease, filter 140ms ease;
    }
    .edge-pipe.dimmed { opacity: 0.18; filter: none; }
    .edge-pipe.focused { opacity: 1; filter: drop-shadow(0 0 9px rgba(159,230,255,0.38)); }
    .edge-pipe.hover { filter: drop-shadow(0 0 10px rgba(159,230,255,0.45)); opacity: 1; }
    .edge-pipe.edge-pipe-preview { opacity: 0.82; stroke-dasharray: 6 4; }
    .anchor-dot {
      transition: fill 120ms ease, opacity 120ms ease, stroke 120ms ease;
      vector-effect: non-scaling-stroke;
      stroke-width: 1.1;
    }
    .anchor-dot.dimmed { opacity: 0.2; }
    .anchor-dot.focused,
    .anchor-dot.hover { opacity: 1; }
    body[data-theme='dark'] .anchor-dot.hover,
    body[data-theme='dark'] .anchor-dot.focused {
      fill: var(--edge-highlight-dark);
      stroke: var(--edge-highlight-dark);
    }
    body[data-theme='light'] .anchor-dot.hover,
    body[data-theme='light'] .anchor-dot.focused {
      fill: var(--edge-highlight-light);
      stroke: var(--edge-highlight-light);
    }
    .edge-warning {
      font-size: 10px;
      fill: #ff9d57;
      font-weight: 600;
      dominant-baseline: central;
    }
    @media (prefers-reduced-motion: reduce) {
      .entity-card,
      #focusBackdrop,
      .edge-pipe,
      .anchor-dot {
        transition: none !important;
      }
    }
  </style>
</head>
<body>
  <div id="app">
    <div id="toolbar">
      <button class="toolbar-button" id="zoomIn">+</button>
      <button class="toolbar-button" id="zoomOut">−</button>
      <button class="toolbar-button" id="resetView">Reset</button>
      <button class="toolbar-button" id="settingsToggle">⚙</button>
      <div id="settingsMenu">
        <div class="settings-section">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">Theme</div>
          <label class="radio-row"><input type="radio" name="theme" value="system" checked> System</label>
          <label class="radio-row"><input type="radio" name="theme" value="light"> Light</label>
          <label class="radio-row"><input type="radio" name="theme" value="dark"> Dark</label>
    </div>
        <div class="settings-section">
          <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">Export</div>
          <div id="exportOptions">
            <select id="exportBg">
              <option value="auto">Auto background</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="transparent">Transparent</option>
            </select>
            <select id="exportScale">
              <option value="1">1x</option>
              <option value="2" selected>2x</option>
              <option value="3">3x</option>
            </select>
  </div>
          <div style="display:flex;gap:8px;margin-top:10px;">
            <button class="menu-button primary" id="exportPng">PNG</button>
            <button class="menu-button" id="exportSvg">SVG</button>
            <button class="menu-button" id="exportPdf">PDF</button>
          </div>
        </div>
        <div class="settings-section">
          <button class="menu-button" id="resetLayout">Reset layout to auto</button>
        </div>
      </div>
    </div>
    <div id="canvas">
      <div id="focusBackdrop"></div>
      <div id="viewport">
        <svg id="edges"></svg>
        <svg id="edgeLabels"></svg>
        <div id="nodes"></div>
      </div>
    </div>
  </div>
  <script nonce="${nonce}" id="initial-data" type="application/json">${serialized}</script>
  <script nonce="${nonce}" src="${htmlToImageUri}"></script>
  <script nonce="${nonce}" src="${pdfLibUri}"></script>
  <script nonce="${nonce}">
    (function () {
      const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
      const payload = JSON.parse(document.getElementById('initial-data').textContent || '{}');
      const model = payload.model || { entities: [], relationships: [] };
      const autoLayout = payload.autoLayout || {};
      const savedLayout = normalizeLayout(payload.savedLayout);
      const state = (vscode && vscode.getState && vscode.getState()) || {};
      let themePreference = state.themePreference || payload.themePreference || 'system';
      let viewportScale = state.viewportScale || 1;
      let viewportTx = state.viewportTx || 40;
      let viewportTy = state.viewportTy || 40;

      const nodesLayer = document.getElementById('nodes');
      const edgesSvg = document.getElementById('edges');
      const edgeLabelsSvg = document.getElementById('edgeLabels');
      const viewportEl = document.getElementById('viewport');
      const settingsToggle = document.getElementById('settingsToggle');
      const settingsMenu = document.getElementById('settingsMenu');
      const zoomInBtn = document.getElementById('zoomIn');
      const zoomOutBtn = document.getElementById('zoomOut');
      const resetViewBtn = document.getElementById('resetView');
      const exportPngBtn = document.getElementById('exportPng');
      const exportSvgBtn = document.getElementById('exportSvg');
      const exportPdfBtn = document.getElementById('exportPdf');
      const resetLayoutBtn = document.getElementById('resetLayout');
      const exportBgSelect = document.getElementById('exportBg');
      const exportScaleSelect = document.getElementById('exportScale');
      const themeInputs = Array.from(document.querySelectorAll('input[name="theme"]'));
      const canvasEl = document.getElementById('canvas');
      const focusBackdrop = document.getElementById('focusBackdrop');
      const DEFAULT_STUB_LENGTH = 16;
      const MIN_STUB_LENGTH = 8;
      const MIN_BUS_OFFSET = 28;
      const MIN_BUS_RUN = 48;
      const MAX_BUS_RUN = 320;
      const DEFAULT_VERTICAL_LEG = 40;
      const MAX_VERTICAL_LEG = 160;
      const PINCH_SENSITIVITY = 0.0012;
      const KEYBOARD_ZOOM_STEP = 0.08;
      const MIN_ZOOM = 0.12;
      const MAX_ZOOM = 3.5;
      const ZOOM_RERENDER_DELAY = 90;
      const MAX_LABEL_STACK = 6;
      const LABEL_STACK_SPACING = 12;
      const CHANGE_ID = '[update-erd-pipeline-connectors]';
      const DEBUG_PIPES = typeof window !== 'undefined' && Boolean(window.DEBUG_PIPES);
      const slotOffsetCache = new Map();
      const edgeElements = new Map();
      let relationshipGroups = [];
      let groupIndexByEntity = new Map();
      let focusEntity = null;
      let focusNeighbors = new Set();
      let keyboardPreviewEntity = null;
      let hoverGroupId = null;
      let currentThemeStyles = getThemeStyles(document.body.dataset.theme || 'dark');
      let focusOverlaySuppressed = false;

      let layoutMap = Object.keys(savedLayout).length ? savedLayout : (state.layout ? normalizeLayout(state.layout) : {});
      const positions = {};
      const entityMetrics = {};
      let selectedEntity = state.selectedEntity || null;
      let persistTimer = null;
      let zoomRenderTimeout = null;
      let zoomRenderRaf = null;

      applyTheme();
      renderEntities();
      applyViewportTransform();
      attachEventHandlers();
      renderEdges();
      observeThemeChanges();
      observeVisibilityChanges();

      function renderEntities() {
        nodesLayer.innerHTML = '';
        slotOffsetCache.clear();
        Object.keys(entityMetrics).forEach(function (key) { delete entityMetrics[key]; });
        model.entities.forEach(function (entity, index) {
          const palette = getPalette(entity.palette);
          const card = document.createElement('div');
          card.className = 'entity-card';
          card.dataset.entity = entity.name;
          card.dataset.focusRole = 'none';
          card.tabIndex = 0;
          card.setAttribute('role', 'button');
          card.setAttribute('aria-pressed', 'false');
          card.style.setProperty('--entity-border', palette.border);
          card.style.setProperty('--entity-body', palette.body);
          card.style.setProperty('--entity-header', palette.header);
          card.style.setProperty('--entity-name-bg', palette.nameBg);
          card.style.setProperty('--entity-type-bg', palette.typeBg);

          const header = document.createElement('div');
          header.className = 'entity-header';
          const title = document.createElement('div');
          title.className = 'name';
          title.textContent = entity.name;
          header.appendChild(title);
          if (entity.iconHint === 'person') {
            const icon = document.createElement('span');
            icon.textContent = '👤';
            header.appendChild(icon);
          }

          const body = document.createElement('div');
          body.className = 'entity-columns';
          const columns = entity.columns || [];
          const rows = columns.length || 1;
          for (var i = 0; i < rows; i++) {
            const column = columns[i];
            const row = document.createElement('div');
            row.className = 'column-row';
            const name = document.createElement('div');
            name.className = 'col-name';
            name.textContent = column && column.name ? column.name : '';
            const type = document.createElement('div');
            type.className = 'col-type';
            type.textContent = column && column.type ? column.type : '';
            const flags = document.createElement('div');
            flags.className = 'col-flags';
            if (column && column.primary) {
              flags.appendChild(createFlagBadge('PK'));
            }
            if (column && column.foreign) {
              flags.appendChild(createFlagBadge('FK'));
            }
            row.appendChild(name);
            row.appendChild(type);
            row.appendChild(flags);
            body.appendChild(row);
            if (vscode && column && column.name) {
              row.addEventListener('dblclick', function () {
                vscode.postMessage({ command: 'reveal', entity: entity.name, column: column.name });
              });
            }
          }

        card.appendChild(header);
          card.appendChild(body);
          nodesLayer.appendChild(card);
          const rect = card.getBoundingClientRect();
          entityMetrics[entity.name] = { width: rect.width, height: rect.height };
          const fallback = autoLayout[entity.name] || { x: (index % 3) * 380, y: Math.floor(index / 3) * 280 };
          positions[entity.name] = layoutMap[entity.name] ? { ...layoutMap[entity.name] } : { ...fallback };
          updateNodePosition(entity.name);
          makeDraggable(card, entity.name);
          card.addEventListener('focus', function () { handleCardFocus(entity.name); });
          card.addEventListener('blur', function () { handleCardBlur(entity.name); });
          card.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              selectedEntity = entity.name;
              toggleFocus(entity.name);
              highlightSelection();
              persistState();
            }
          });
        });
        highlightSelection();
        applyFocusState();
        applyKeyboardPreviewState();
      }

      function createFlagBadge(label) {
        const badge = document.createElement('span');
        badge.className = 'flag-badge';
        const icon = document.createElement('img');
        icon.src = '${keyIconUri}';
        icon.alt = label;
        badge.appendChild(icon);
        const text = document.createElement('span');
        text.textContent = label;
        badge.appendChild(text);
        return badge;
      }

      function logDebug() {
        if (!DEBUG_PIPES) return;
        const args = Array.prototype.slice.call(arguments);
        console.debug.apply(console, [CHANGE_ID].concat(args));
      }

      function warnWithId(message, payload) {
        console.warn(CHANGE_ID + ' ' + message, payload || '');
      }

      function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
      }

      function clampRange(value, min, max) {
        if (min > max) return (min + max) / 2;
        return Math.max(min, Math.min(max, value));
      }

      function normalizeEntityName(name) {
        if (!name) return '';
        return name.replace(/["'\u0060]/g, '').split('.').pop().trim().toLowerCase();
      }

      function buildEntityLookup(entities) {
        const map = new Map();
        entities.forEach(function (entity) {
          const key = normalizeEntityName(entity.name);
          if (key && !map.has(key)) {
            map.set(key, entity.name);
          }
        });
        return map;
      }

      function computeStubLength(deltaX) {
        if (!deltaX || deltaX < 0) return DEFAULT_STUB_LENGTH;
        if (deltaX < 80) {
          return clamp(deltaX * 0.25, MIN_STUB_LENGTH, DEFAULT_STUB_LENGTH);
        }
        return DEFAULT_STUB_LENGTH;
      }

      function buildRoundedPathFromPoints(points, radius) {
        const filtered = [];
        points.forEach(function (pt) {
          if (!filtered.length) {
            filtered.push(pt);
            return;
          }
          const last = filtered[filtered.length - 1];
          if (Math.abs(last.x - pt.x) < 0.5 && Math.abs(last.y - pt.y) < 0.5) return;
          filtered.push(pt);
        });
        if (!filtered.length) return '';
        if (filtered.length === 1) return ['M', filtered[0].x, filtered[0].y].join(' ');
        const path = ['M', filtered[0].x, filtered[0].y];
        for (let i = 1; i < filtered.length; i++) {
          const current = filtered[i];
          const prev = filtered[i - 1];
          const next = filtered[i + 1];
          if (!next) {
            path.push('L', current.x, current.y);
            continue;
          }
          const vecA = { x: current.x - prev.x, y: current.y - prev.y };
          const vecB = { x: next.x - current.x, y: next.y - current.y };
          const lenA = Math.hypot(vecA.x, vecA.y);
          const lenB = Math.hypot(vecB.x, vecB.y);
          if (lenA === 0 || lenB === 0) continue;
          const cut = Math.min(radius, lenA / 2, lenB / 2);
          const startCorner = {
            x: current.x - (vecA.x / lenA) * cut,
            y: current.y - (vecA.y / lenA) * cut,
          };
          const endCorner = {
            x: current.x + (vecB.x / lenB) * cut,
            y: current.y + (vecB.y / lenB) * cut,
          };
          path.push('L', startCorner.x, startCorner.y);
          path.push('Q', current.x, current.y, endCorner.x, endCorner.y);
        }
        const lastPoint = filtered[filtered.length - 1];
        path.push('L', lastPoint.x, lastPoint.y);
        return path.join(' ');
      }

      function getEntityRect(card) {
        const name = card.dataset.entity;
        if (name && entityMetrics[name]) return entityMetrics[name];
        const rect = card.getBoundingClientRect();
        const dims = { width: rect.width, height: rect.height };
        if (name) entityMetrics[name] = dims;
        return dims;
      }

      function buildAnchorMaps(entities, groups, layer, posMap) {
        const sourceAnchors = new Array(groups.length);
        const targetAnchors = new Array(groups.length);
        const entityMeta = {};
        entities.forEach(function (entity) {
          const card = layer.querySelector('.entity-card[data-entity="' + CSS.escape(entity.name) + '"]');
          if (!card) return;
          const rect = getEntityRect(card);
          const pos = posMap[entity.name];
          if (!pos) return;
          entityMeta[entity.name] = { width: rect.width, height: rect.height, pos };
        });
        const outgoing = {};
        const incoming = {};
        groups.forEach(function (group, idx) {
          outgoing[group.from] = outgoing[group.from] || [];
          outgoing[group.from].push(idx);
          incoming[group.to] = incoming[group.to] || [];
          incoming[group.to].push(idx);
        });
        Object.keys(outgoing).forEach(function (name) {
          const meta = entityMeta[name];
          if (!meta) return;
          const slots = computeSlots(meta, outgoing[name].length, true);
          outgoing[name].forEach(function (groupIdx, slotIdx) {
            sourceAnchors[groupIdx] = slots[slotIdx];
          });
        });
        Object.keys(incoming).forEach(function (name) {
          const meta = entityMeta[name];
          if (!meta) return;
          const slots = computeSlots(meta, incoming[name].length, false);
          incoming[name].forEach(function (groupIdx, slotIdx) {
            targetAnchors[groupIdx] = slots[slotIdx];
          });
        });
        return { sourceAnchors, targetAnchors };
      }

      function computeSlots(meta, count, isOutgoing) {
        if (!count) return [];
        const offsets = getSlotOffsets(meta.height, count);
        return offsets.map(function (offset) {
          return {
            x: isOutgoing ? meta.pos.x + meta.width : meta.pos.x,
            y: meta.pos.y + offset,
          };
        });
      }

      function getSlotOffsets(height, count) {
        const key = height + ':' + count;
        if (slotOffsetCache.has(key)) return slotOffsetCache.get(key);
        const headerReserve = clamp(height * 0.12, 32, 52);
        const footerReserve = clamp(height * 0.08, 20, 40);
        const usable = Math.max(height - headerReserve - footerReserve, 40);
        const compressed = usable * 0.8;
        const spacing = count === 1 ? 0 : Math.max(18, compressed / (count - 1));
        const start = headerReserve + (usable - compressed) / 2;
        const offsets = [];
        for (let i = 0; i < count; i++) offsets.push(start + spacing * i);
        slotOffsetCache.set(key, offsets);
        return offsets;
      }

      function buildPipelinePath(start, end, options) {
        if (options && options.selfLoop) {
          return buildSelfLoopPath(start, options);
        }
        const dir = end.x >= start.x ? 1 : -1;
        const absDeltaX = Math.max(1, Math.abs(end.x - start.x));
        const stubLength = computeStubLength(absDeltaX);
        const exitX = start.x + dir * stubLength;
        const entryX = end.x - dir * stubLength;
        const variant = ((options && options.variant) || 0) % 5 - 2;

        const sumWidth = (options && options.sourceMeta ? options.sourceMeta.width : 0) + (options && options.targetMeta ? options.targetMeta.width : 0);
        const guardBase = sumWidth ? Math.min(sumWidth * 0.04, 90) : MIN_BUS_OFFSET;
        const guard = Math.max(MIN_BUS_OFFSET, guardBase);
        const horizontalSpan = Math.max(8, Math.abs(entryX - exitX));
        let desiredRun;
        if (horizontalSpan < 120) desiredRun = Math.max(guard + 6, horizontalSpan * 0.45 + 12);
        else desiredRun = horizontalSpan * 0.5 + 18;
        desiredRun = clamp(desiredRun + variant * 4, guard + 6, MAX_BUS_RUN);

        let busX = exitX + dir * desiredRun;
        const lowerBound = dir > 0 ? exitX + dir * guard : entryX - dir * guard;
        const upperBound = dir > 0 ? entryX - dir * guard : exitX + dir * guard;
        if (dir > 0) busX = clamp(busX, lowerBound, upperBound);
        else busX = clamp(busX, upperBound, lowerBound);

        const deltaY = end.y - start.y;
        const absDeltaY = Math.abs(deltaY);
        const verticalDir = absDeltaY === 0 ? 1 : deltaY > 0 ? 1 : -1;
        let verticalLeg;
        if (absDeltaY < 24) verticalLeg = Math.max(6, absDeltaY * 0.45);
        else verticalLeg = clamp(absDeltaY * 0.32, 18, MAX_VERTICAL_LEG);
        let liftY = start.y + verticalDir * verticalLeg;
        let dropY = end.y - verticalDir * verticalLeg;
        if ((verticalDir > 0 && liftY > dropY) || (verticalDir < 0 && liftY < dropY)) {
          const midpoint = (start.y + end.y) / 2;
          const adjust = Math.min(Math.abs(midpoint - start.y), DEFAULT_VERTICAL_LEG);
          liftY = start.y + verticalDir * adjust;
          dropY = end.y - verticalDir * adjust;
        }

        const points = [
          { x: start.x, y: start.y },
          { x: exitX, y: start.y },
          { x: exitX, y: liftY },
          { x: busX, y: liftY },
          { x: busX, y: dropY },
          { x: entryX, y: dropY },
          { x: entryX, y: end.y },
          { x: end.x, y: end.y },
        ];
        const cornerRadius = clamp(Math.min(Math.abs(busX - exitX), Math.abs(liftY - start.y), Math.abs(dropY - liftY)) * 0.55 + 8, 8, 42);
        return buildRoundedPathFromPoints(points, cornerRadius);
      }

      function buildSelfLoopPath(anchor, options) {
        const dir = ((options && options.variant) || 0) % 2 === 0 ? 1 : -1;
        const meta = options && options.sourceMeta;
        const loopWidth = meta ? clamp(meta.width * 0.55, 60, 160) : 80;
        const loopHeight = meta ? clamp(meta.height * 0.45, 48, 140) : 60;
        const farX = anchor.x + dir * (loopWidth + DEFAULT_STUB_LENGTH);
        const topY = anchor.y - loopHeight;
        return [
          'M', anchor.x, anchor.y,
          'L', anchor.x + dir * DEFAULT_STUB_LENGTH, anchor.y,
          'L', farX - dir * 18, anchor.y,
          'Q', farX, anchor.y, farX, anchor.y - 18,
          'L', farX, topY,
          'Q', farX, topY - 18, farX - dir * 18, topY - 18,
          'L', anchor.x - dir * (loopWidth / 2), topY - 18,
          'Q', anchor.x - dir * (loopWidth / 2) - dir * 18, topY - 18, anchor.x - dir * (loopWidth / 2) - dir * 18, topY,
          'L', anchor.x - dir * (loopWidth / 2) - dir * 18, anchor.y - 18,
          'L', anchor.x - dir * DEFAULT_STUB_LENGTH, anchor.y - 6,
          'L', anchor.x, anchor.y
        ].join(' ');
      }

      function createAnchorDot(anchor, themeStyles) {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', String(anchor.x));
        dot.setAttribute('cy', String(anchor.y));
        dot.setAttribute('r', '3');
        dot.setAttribute('fill', themeStyles.anchorFill);
        dot.setAttribute('stroke', themeStyles.anchorStroke);
        dot.setAttribute('stroke-width', '1');
        dot.classList.add('anchor-dot');
        edgesSvg.appendChild(dot);
        return dot;
      }

      function renderCardinalityStack(group, startAnchor, endAnchor, themeStyles) {
        const values = group.cardinalities || [];
        let visibleIndex = 0;
        let total = 0;
        const sourceMeta = entityMetrics[group.from];
        const compactSource = sourceMeta && sourceMeta.height < 140;
        const outward = (compactSource ? 16 : 10) + (values.length > 4 ? 4 : 0);
        const created = [];
        values.forEach(function (value) {
          if (!value) return;
          total++;
          if (visibleIndex < MAX_LABEL_STACK) {
            const textNode = addRelationshipLabel(value, startAnchor, endAnchor, themeStyles, {
              position: 'edge',
              stackIndex: visibleIndex,
              anchor: 'start',
              outward,
              meta: { from: group.from, to: group.to, relCount: group.indexes.length },
            });
            if (textNode) created.push(textNode);
            visibleIndex++;
          }
        });
        const hidden = total - visibleIndex;
        if (hidden > 0) {
          const extra = addRelationshipLabel('+' + hidden + ' more', startAnchor, endAnchor, themeStyles, {
            position: 'edge',
            stackIndex: visibleIndex,
            muted: true,
            anchor: 'start',
            outward,
            meta: { from: group.from, to: group.to, relCount: group.indexes.length },
          });
          if (extra) created.push(extra);
          warnWithId('Cardinality stack truncated for ' + group.id, group);
        }
        if (total > 10) {
          const warning = addRelationshipLabel('⚠', startAnchor, endAnchor, themeStyles, {
            position: 'edge',
            stackIndex: visibleIndex + 0.4,
            anchor: 'start',
            outward: outward + 6,
            meta: { from: group.from, to: group.to, relCount: group.indexes.length, warning: true },
          });
          if (warning) created.push(warning);
          warnWithId('Excessive cardinality labels (' + total + ') for ' + group.id, group);
        }
        return created;
      }

      function createRelationshipGroups(relationships, entities) {
        const map = new Map();
        const groups = [];
        const lookup = buildEntityLookup(entities || []);
        (relationships || []).forEach(function (rel, index) {
          const rawFrom = rel.from && rel.from.entity;
          const rawTo = rel.to && rel.to.entity;
          if (!rawFrom || !rawTo) return;
          const fromKey = normalizeEntityName(rawFrom);
          const toKey = normalizeEntityName(rawTo);
          if (!fromKey || !toKey) return;
          const resolvedFrom = lookup.get(fromKey) || rawFrom;
          const resolvedTo = lookup.get(toKey) || rawTo;
          const key = fromKey + '→' + toKey;
          let group = map.get(key);
          if (!group) {
            group = {
              id: key,
              from: resolvedFrom,
              to: resolvedTo,
              canonicalFrom: fromKey,
              canonicalTo: toKey,
              indexes: [],
              columns: [],
              cardinalities: [],
            };
            map.set(key, group);
            groups.push(group);
          }
          group.indexes.push(index);
          group.columns.push(rel.from && rel.from.column ? rel.from.column : '');
          group.cardinalities.push(rel.cardinality || '');
        });
        return groups;
      }

      function buildGroupIndex(groups) {
        const map = new Map();
        groups.forEach(function (group, idx) {
          const entries = [
            { entity: group.from, index: idx },
            { entity: group.to, index: idx },
          ];
          entries.forEach(function (entry) {
            if (!entry.entity) return;
            const bucket = map.get(entry.entity) || [];
            bucket.push({ group, index: entry.index });
            map.set(entry.entity, bucket);
          });
        });
        return map;
      }

      function addRelationshipLabel(label, start, end, themeStyles, options) {
        const opts = options || {};
        const meta = opts.meta;
        if (opts.position === 'mid') {
          const centerX = (start.x + end.x) / 2;
          const centerY = (start.y + end.y) / 2 - 8;
          return drawLabel(centerX, centerY, label, themeStyles, { alignEnd: false, muted: opts.muted, meta });
        }
        const stackIndex = opts.stackIndex || 0;
        const anchor = opts.anchor === 'end' ? 'end' : 'start';
        const outward = typeof opts.outward === 'number' ? opts.outward : 10;
        const sourceDir = start.x <= end.x ? 1 : -1;
        const direction = anchor === 'end' ? -sourceDir : sourceDir;
        const anchorPoint = anchor === 'end' ? end : start;
        const yOffset = 6 + stackIndex * LABEL_STACK_SPACING;
        const y = anchorPoint.y - yOffset;
        const x = anchorPoint.x + direction * outward;
        return drawLabel(x, y, label, themeStyles, { alignEnd: direction < 0, muted: opts.muted, meta });
      }

      function drawLabel(x, y, textValue, themeStyles, options) {
        const alignEnd = options && options.alignEnd;
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(x));
        text.setAttribute('y', String(y));
        text.setAttribute('fill', themeStyles.labelText);
        text.setAttribute('font-size', '11');
        text.setAttribute('font-weight', '600');
        text.setAttribute('text-anchor', alignEnd ? 'end' : 'start');
        text.setAttribute('dominant-baseline', 'central');
        if (options && options.muted) text.setAttribute('opacity', '0.78');
        if (options && options.meta) {
          if (options.meta.from) text.dataset.from = options.meta.from;
          if (options.meta.to) text.dataset.to = options.meta.to;
          if (options.meta.relCount != null) text.dataset.relCount = String(options.meta.relCount);
          if (options.meta.warning) text.dataset.warning = 'true';
        }
        text.textContent = textValue;
        text.classList.add('edge-label');
        edgeLabelsSvg.appendChild(text);
        return text;
      }

      function getThemeStyles(theme) {
        const styles = getComputedStyle(document.body);
        if (theme === 'light') {
          return {
            edge: (styles.getPropertyValue('--edge-stroke-light') || '#5c6f91').trim(),
            highlightEdge: (styles.getPropertyValue('--edge-highlight-light') || '#4d8dff').trim(),
            labelText: 'rgba(17,26,44,0.9)',
            anchorFill: (styles.getPropertyValue('--edge-anchor-light') || 'rgba(8,19,32,0.7)').trim(),
            anchorStroke: 'rgba(255,255,255,0.9)',
          };
        }
        return {
          edge: (styles.getPropertyValue('--edge-stroke-dark') || '#8ca2c7').trim(),
          highlightEdge: (styles.getPropertyValue('--edge-highlight-dark') || '#a8e2ff').trim(),
          labelText: 'rgba(255,255,255,0.9)',
          anchorFill: (styles.getPropertyValue('--edge-anchor-dark') || 'rgba(255,255,255,0.85)').trim(),
          anchorStroke: 'rgba(5,12,24,0.6)',
        };
      }

      function updateNodePosition(name) {
        const card = nodesLayer.querySelector('.entity-card[data-entity="' + CSS.escape(name) + '"]');
        if (!card) return;
        const pos = positions[name] || { x: 0, y: 0 };
        card.style.transform = 'translate(' + pos.x + 'px,' + pos.y + 'px)';
      }

      function renderEdges() {
        const debugStart = DEBUG_PIPES ? performance.now() : 0;
        let maxX = 0;
        let maxY = 0;
        const padding = 600;
        model.entities.forEach(function (entity) {
          const card = nodesLayer.querySelector('.entity-card[data-entity="' + CSS.escape(entity.name) + '"]');
          if (!card) return;
          const rect = getEntityRect(card);
          const pos = positions[entity.name];
          if (!pos) return;
          maxX = Math.max(maxX, pos.x + rect.width);
          maxY = Math.max(maxY, pos.y + rect.height);
        });
        const width = maxX + padding;
        const height = maxY + padding;
        edgesSvg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        edgesSvg.setAttribute('width', String(width));
        edgesSvg.setAttribute('height', String(height));
        edgeLabelsSvg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        edgeLabelsSvg.setAttribute('width', String(width));
        edgeLabelsSvg.setAttribute('height', String(height));
        edgesSvg.innerHTML = '';
        edgeLabelsSvg.innerHTML = '';
        edgeElements.clear();
        hoverGroupId = null;
        relationshipGroups = createRelationshipGroups(model.relationships || [], model.entities || []);
        groupIndexByEntity = buildGroupIndex(relationshipGroups);
        const anchorMaps = buildAnchorMaps(model.entities, relationshipGroups, nodesLayer, positions);
        const theme = document.body.dataset.theme || 'dark';
        currentThemeStyles = getThemeStyles(theme);

        relationshipGroups.forEach(function (group, groupIndex) {
          const startAnchor = anchorMaps.sourceAnchors[groupIndex];
          const endAnchor = anchorMaps.targetAnchors[groupIndex];
          if (!startAnchor || !endAnchor) {
            warnWithId('Missing anchor for relationship', group);
            return;
          }
          const sourceMeta = entityMetrics[group.from] || null;
          const targetMeta = entityMetrics[group.to] || null;
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const d = buildPipelinePath(startAnchor, endAnchor, {
            selfLoop: group.from === group.to,
            variant: groupIndex,
            sourceMeta,
            targetMeta,
          });
        path.setAttribute('d', d);
          path.setAttribute('stroke', currentThemeStyles.edge);
          path.setAttribute('stroke-width', '2');
          path.setAttribute('fill', 'none');
          path.setAttribute('opacity', '0.9');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          path.classList.add('edge-pipe');
          path.dataset.groupId = group.id;
          path.dataset.from = group.from;
          path.dataset.to = group.to;
          path.dataset.relCount = String(group.indexes.length);
          edgesSvg.appendChild(path);

          const startDot = createAnchorDot(startAnchor, currentThemeStyles);
          const endDot = createAnchorDot(endAnchor, currentThemeStyles);
          startDot.dataset.groupId = group.id;
          startDot.dataset.role = 'anchor-start';
          endDot.dataset.groupId = group.id;
          endDot.dataset.role = 'anchor-end';

          path.addEventListener('pointerenter', function () {
            setPipeHover(group.id, true);
          });
          path.addEventListener('pointerleave', function () {
            setPipeHover(group.id, false);
          });

          const labels = renderCardinalityStack(group, startAnchor, endAnchor, currentThemeStyles);
          edgeElements.set(group.id, { path, startDot, endDot, startAnchor, endAnchor, group, labels });
        });

        applyFocusState();
        applyKeyboardPreviewState();
        if (DEBUG_PIPES) {
          logDebug('renderEdges', (performance.now() - debugStart).toFixed(2) + 'ms');
        }
        zoomRenderTimeout = null;
        zoomRenderRaf = null;
      }

      function attachEventHandlers() {
        settingsToggle.addEventListener('click', function () {
          settingsMenu.classList.toggle('active');
        });
        document.addEventListener('click', function (event) {
          if (!settingsMenu.contains(event.target) && event.target !== settingsToggle) {
            settingsMenu.classList.remove('active');
          }
        });
        zoomInBtn.addEventListener('click', function () { adjustZoom(1 + KEYBOARD_ZOOM_STEP); });
        zoomOutBtn.addEventListener('click', function () { adjustZoom(1 / (1 + KEYBOARD_ZOOM_STEP)); });
        resetViewBtn.addEventListener('click', function () {
          viewportScale = 1;
          viewportTx = 40;
          viewportTy = 40;
          applyViewportTransform();
          persistViewState();
        });
        exportPngBtn.addEventListener('click', function () { exportImage('png'); });
        exportSvgBtn.addEventListener('click', function () { exportImage('svg'); });
        exportPdfBtn.addEventListener('click', function () { exportImage('pdf'); });
        resetLayoutBtn.addEventListener('click', function () {
          layoutMap = {};
          Object.keys(autoLayout).forEach(function (name) {
            positions[name] = { ...autoLayout[name] };
            updateNodePosition(name);
          });
          renderEdges();
          persistLayout();
        });
        themeInputs.forEach(function (input) {
          if (!(input instanceof HTMLInputElement)) return;
          if (input.value === themePreference) input.checked = true;
          input.addEventListener('change', function () {
            themePreference = input.value;
            applyTheme();
            if (vscode) vscode.postMessage({ command: 'saveTheme', theme: themePreference });
            persistState();
          });
        });
        canvasEl.addEventListener('wheel', function (event) {
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            const pinchFactor = Math.exp(-event.deltaY * PINCH_SENSITIVITY);
            const delta = clamp(pinchFactor, 0.82, 1.22);
            const rect = canvasEl.getBoundingClientRect();
            const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            zoomAround(delta, point);
            scheduleEdgeRender();
          } else {
            viewportTx -= event.deltaX;
            viewportTy -= event.deltaY;
            applyViewportTransform();
            persistViewState();
          }
        }, { passive: false });

        let panState = null;
        canvasEl.addEventListener('pointerdown', function (event) {
          const target = event.target;
          const isCard = target instanceof HTMLElement && target.closest('.entity-card');
          const isEdge = target instanceof SVGElement && target.closest && (target.closest('#edges') || target.closest('#edgeLabels'));
          if (isCard || isEdge) return;
          panState = { startX: event.clientX, startY: event.clientY, tx: viewportTx, ty: viewportTy };
          canvasEl.setPointerCapture(event.pointerId);
        });
        canvasEl.addEventListener('pointermove', function (event) {
          if (!panState) return;
          viewportTx = panState.tx + (event.clientX - panState.startX);
          viewportTy = panState.ty + (event.clientY - panState.startY);
          applyViewportTransform();
        });
        canvasEl.addEventListener('pointerup', function (event) {
          if (panState) {
            canvasEl.releasePointerCapture(event.pointerId);
            panState = null;
            persistViewState();
          }
        });
        canvasEl.addEventListener('click', function (event) {
          const target = event.target;
          const isCard = target instanceof HTMLElement && target.closest('.entity-card');
          const isEdge = target instanceof SVGElement && target.closest && (target.closest('#edges') || target.closest('#edgeLabels'));
          if (isCard || isEdge) return;
          if (focusEntity) {
            clearFocus();
            selectedEntity = null;
            highlightSelection();
            persistState();
          }
        });

        document.addEventListener('keydown', function (event) {
          if (event.key === 'Escape') {
            if (hoverGroupId) setPipeHover(hoverGroupId, false);
            clearFocus();
            return;
          }
          if ((event.metaKey || event.ctrlKey) && (event.key === '=' || event.key === '+')) {
            event.preventDefault();
            adjustZoom(1 + KEYBOARD_ZOOM_STEP);
            scheduleEdgeRender();
          } else if ((event.metaKey || event.ctrlKey) && event.key === '-') {
            event.preventDefault();
            adjustZoom(1 / (1 + KEYBOARD_ZOOM_STEP));
            scheduleEdgeRender();
          } else if ((event.metaKey || event.ctrlKey) && event.key === '0') {
            event.preventDefault();
            viewportScale = 1;
            applyViewportTransform();
            persistViewState();
          } else if ((event.metaKey || event.ctrlKey) && (event.key === 's' || event.key === 'S')) {
            event.preventDefault();
            persistLayout();
          } else if ((event.metaKey || event.ctrlKey) && (event.key === 'e' || event.key === 'E')) {
            event.preventDefault();
            settingsMenu.classList.add('active');
          } else if (selectedEntity && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
            event.preventDefault();
            const delta = event.shiftKey ? 20 : 8;
            const pos = positions[selectedEntity];
            if (!pos) return;
            if (event.key === 'ArrowUp') pos.y -= delta;
            if (event.key === 'ArrowDown') pos.y += delta;
            if (event.key === 'ArrowLeft') pos.x -= delta;
            if (event.key === 'ArrowRight') pos.x += delta;
            layoutMap[selectedEntity] = { ...pos };
            updateNodePosition(selectedEntity);
            renderEdges();
            persistLayoutDebounced();
          }
        });

        nodesLayer.addEventListener('click', function (event) {
          const target = event.target;
          const card = target instanceof HTMLElement ? target.closest('.entity-card') : null;
          if (!card) {
            selectedEntity = null;
            clearFocus();
            highlightSelection();
            persistState();
            return;
          }
          selectedEntity = card.dataset.entity || null;
          if (selectedEntity) setFocus(selectedEntity);
          highlightSelection();
          persistState();
        });
      }

      function makeDraggable(card, name) {
        card.addEventListener('pointerdown', function (event) {
          event.stopPropagation();
          const pos = positions[name];
          if (!pos) return;
          const start = { x: event.clientX, y: event.clientY };
          const origin = { ...pos };
          card.setPointerCapture(event.pointerId);
          const move = function (ev) {
            const dx = (ev.clientX - start.x) / viewportScale;
            const dy = (ev.clientY - start.y) / viewportScale;
            positions[name] = { x: origin.x + dx, y: origin.y + dy };
            layoutMap[name] = { ...positions[name] };
            updateNodePosition(name);
            renderEdges();
          };
          const up = function (ev) {
            card.releasePointerCapture(ev.pointerId);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            persistLayout();
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        });
      }

      function highlightSelection() {
        nodesLayer.querySelectorAll('.entity-card').forEach(function (node) {
          node.classList.remove('selected');
          node.classList.remove('edge-hover');
        });
        if (!selectedEntity) return;
        const card = nodesLayer.querySelector('.entity-card[data-entity="' + CSS.escape(selectedEntity) + '"]');
        if (card) card.classList.add('selected');
      }

      function highlightEntities(fromName, toName, active) {
        [fromName, toName].forEach(function (name) {
          const card = nodesLayer.querySelector('.entity-card[data-entity="' + CSS.escape(name) + '"]');
          if (!card) return;
          if (active) card.classList.add('edge-hover');
          else card.classList.remove('edge-hover');
        });
      }

      function setLabelsState(entry, mode) {
        if (!entry.labels) return;
        entry.labels.forEach(function (label) {
          label.classList.remove('label-hover', 'label-focused', 'label-dimmed');
          if (mode === 'hover') label.classList.add('label-hover');
          else if (mode === 'focus') label.classList.add('label-focused');
          else if (mode === 'dim') label.classList.add('label-dimmed');
        });
      }

      function setPipeHover(groupId, active) {
        const entry = edgeElements.get(groupId);
        if (!entry) return;
        if (active) {
          hoverGroupId = groupId;
          entry.path.classList.add('hover');
          entry.path.classList.remove('edge-pipe-preview');
          entry.path.setAttribute('stroke', currentThemeStyles.highlightEdge);
          entry.startDot.classList.add('hover');
          entry.endDot.classList.add('hover');
          setLabelsState(entry, 'hover');
          highlightEntities(entry.group.from, entry.group.to, true);
          return;
        }
        if (hoverGroupId !== groupId) return;
        hoverGroupId = null;
        entry.path.classList.remove('hover');
        entry.startDot.classList.remove('hover');
        entry.endDot.classList.remove('hover');
        setLabelsState(entry, null);
        highlightEntities(entry.group.from, entry.group.to, false);
        applyFocusState();
        applyKeyboardPreviewState();
      }

      function applyFocusState() {
        const active = Boolean(focusEntity);
        const overlayActive = active && !focusOverlaySuppressed;
        document.body.classList.toggle('focus-mode', overlayActive);
        nodesLayer.querySelectorAll('.entity-card').forEach(function (card) {
          const name = card.dataset.entity;
          let role = 'none';
          if (active) {
            if (name === focusEntity) role = 'primary';
            else if (focusNeighbors.has(name)) role = 'neighbor';
            else role = 'dimmed';
          }
          card.dataset.focusRole = role;
          card.setAttribute('aria-pressed', role === 'primary' ? 'true' : 'false');
          if (!active && !card.classList.contains('selected')) {
            card.classList.remove('edge-hover');
          }
        });
        edgeElements.forEach(function (entry) {
          const path = entry.path;
          const startDot = entry.startDot;
          const endDot = entry.endDot;
          if (!active) {
            if (!path.classList.contains('hover')) path.setAttribute('stroke', currentThemeStyles.edge);
            path.classList.remove('focused', 'dimmed');
            startDot.classList.remove('focused', 'dimmed');
            endDot.classList.remove('focused', 'dimmed');
            if (!path.classList.contains('hover')) setLabelsState(entry, null);
            return;
          }
          if (path.classList.contains('hover')) {
            setLabelsState(entry, 'hover');
            return;
          }
          const isFocusPipe = entry.group.from === focusEntity || entry.group.to === focusEntity;
          path.classList.remove('focused', 'dimmed');
          startDot.classList.remove('focused', 'dimmed');
          endDot.classList.remove('focused', 'dimmed');
          if (isFocusPipe) {
            path.classList.add('focused');
            path.setAttribute('stroke', currentThemeStyles.highlightEdge);
            startDot.classList.add('focused');
            endDot.classList.add('focused');
            setLabelsState(entry, 'focus');
          } else {
            path.classList.add('dimmed');
            path.setAttribute('stroke', currentThemeStyles.edge);
            startDot.classList.add('dimmed');
            endDot.classList.add('dimmed');
            setLabelsState(entry, 'dim');
          }
        });
      }

      function applyKeyboardPreviewState() {
        if (focusEntity) {
          keyboardPreviewEntity = null;
        }
        nodesLayer.querySelectorAll('.entity-card').forEach(function (card) {
          const isPreview = keyboardPreviewEntity && card.dataset.entity === keyboardPreviewEntity;
          card.classList.toggle('keyboard-preview', Boolean(isPreview));
        });
        edgeElements.forEach(function (entry) {
          if (entry.path.classList.contains('hover')) return;
          const isPreview = keyboardPreviewEntity && (entry.group.from === keyboardPreviewEntity || entry.group.to === keyboardPreviewEntity);
          entry.path.classList.toggle('edge-pipe-preview', Boolean(isPreview));
        });
      }

      function handleCardFocus(name) {
        if (focusEntity) return;
        keyboardPreviewEntity = name;
        applyKeyboardPreviewState();
      }

      function handleCardBlur() {
        keyboardPreviewEntity = null;
        applyKeyboardPreviewState();
      }

      function computeFocusNeighbors(name) {
        const neighbors = new Set();
        (groupIndexByEntity.get(name) || []).forEach(function (entry) {
          const other = entry.group.from === name ? entry.group.to : entry.group.from;
          if (other && other !== name) neighbors.add(other);
        });
        return neighbors;
      }

      function setFocus(name) {
        if (!name) return;
        focusEntity = name;
        focusNeighbors = computeFocusNeighbors(name);
        keyboardPreviewEntity = null;
        applyFocusState();
        applyKeyboardPreviewState();
      }

      function toggleFocus(name) {
        if (focusEntity === name) {
          clearFocus();
          return;
        }
        setFocus(name);
      }

      function clearFocus() {
        if (!focusEntity && focusNeighbors.size === 0) return;
        focusEntity = null;
        focusNeighbors = new Set();
        focusOverlaySuppressed = false;
        document.body.classList.remove('focus-mode');
        applyFocusState();
        applyKeyboardPreviewState();
      }

      function applyTheme() {
        const theme = themePreference === 'system' ? inferVsCodeTheme() : themePreference;
        document.body.dataset.theme = theme;
        renderEdges();
      }

      function inferVsCodeTheme() {
        const cls = document.body.classList;
        if (cls.contains('vscode-light')) return 'light';
        if (cls.contains('vscode-dark')) return 'dark';
        if (cls.contains('vscode-high-contrast')) return 'dark';
        return 'dark';
      }

      function adjustZoom(factor) {
        const rect = canvasEl.getBoundingClientRect();
        const point = { x: rect.width / 2, y: rect.height / 2 };
        zoomAround(factor, point);
      }

      function zoomAround(factor, point) {
        const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewportScale * factor));
        const worldX = (point.x - viewportTx) / viewportScale;
        const worldY = (point.y - viewportTy) / viewportScale;
        viewportScale = newScale;
        viewportTx = point.x - worldX * viewportScale;
        viewportTy = point.y - worldY * viewportScale;
        applyViewportTransform();
        persistViewState();
        scheduleEdgeRender();
      }

      function applyViewportTransform() {
        viewportEl.style.transform = 'translate(' + viewportTx + 'px,' + viewportTy + 'px) scale(' + viewportScale + ')';
      }

      function scheduleEdgeRender() {
        if (zoomRenderRaf) cancelAnimationFrame(zoomRenderRaf);
        zoomRenderRaf = requestAnimationFrame(function () {
          if (zoomRenderTimeout) clearTimeout(zoomRenderTimeout);
          zoomRenderTimeout = window.setTimeout(function () {
            renderEdges();
          }, ZOOM_RERENDER_DELAY);
        });
      }

      function forceRenderEdges() {
        if (zoomRenderRaf) {
          cancelAnimationFrame(zoomRenderRaf);
          zoomRenderRaf = null;
        }
        if (zoomRenderTimeout) {
          clearTimeout(zoomRenderTimeout);
          zoomRenderTimeout = null;
        }
        renderEdges();
      }

      function exportImage(kind) {
        const htmlToImage = window.htmlToImage;
        if (!htmlToImage) return;
        forceRenderEdges();
        const target = canvasEl.cloneNode(true);
        const viewportClone = target.querySelector('#viewport');
        if (viewportClone) viewportClone.style.transform = 'translate(0px,0px) scale(1)';
        const theme = document.body.dataset.theme || 'dark';
        const bgChoice = (exportBgSelect.value || 'auto');
        let background = 'transparent';
        if (bgChoice === 'auto') background = theme === 'dark' ? getComputedStyle(document.body).getPropertyValue('--canvas-bg-dark') : getComputedStyle(document.body).getPropertyValue('--canvas-bg-light');
        else if (bgChoice === 'dark') background = getComputedStyle(document.body).getPropertyValue('--canvas-bg-dark');
        else if (bgChoice === 'light') background = getComputedStyle(document.body).getPropertyValue('--canvas-bg-light');
        const scale = Number(exportScaleSelect.value) || 2;
        if (kind === 'png') {
          htmlToImage.toPng(target, { pixelRatio: scale, backgroundColor: background }).then(function (dataUrl) {
            downloadDataUrl(dataUrl, 'erd.png');
          });
        } else if (kind === 'svg') {
          htmlToImage.toSvg(target, { pixelRatio: scale, backgroundColor: background }).then(function (dataUrl) {
            downloadDataUrl(dataUrl, 'erd.svg');
          });
        } else {
          htmlToImage.toPng(target, { pixelRatio: scale, backgroundColor: background }).then(async function (dataUrl) {
            const pdfLib = window.PDFLib;
            if (!pdfLib) return;
            const pdfDoc = await pdfLib.PDFDocument.create();
            const page = pdfDoc.addPage();
            const pngBytes = await fetch(dataUrl).then(function (res) { return res.arrayBuffer(); });
            const pngImage = await pdfDoc.embedPng(pngBytes);
            const { width, height } = pngImage.scale(1);
            page.setSize(width, height);
            page.drawImage(pngImage, { x: 0, y: 0, width, height });
            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            downloadUrl(url, 'erd.pdf');
            URL.revokeObjectURL(url);
          });
        }
      }

      function downloadDataUrl(dataUrl, name) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = name;
        link.click();
      }

      function downloadUrl(url, name) {
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
      }

      function persistLayoutDebounced() {
        if (persistTimer) clearTimeout(persistTimer);
        persistTimer = window.setTimeout(function () {
          persistLayout();
        }, 500);
      }

      function persistLayout() {
        const payload = { entities: Object.entries(positions).map(function ([name, pos]) { return { name, x: pos.x, y: pos.y }; }) };
        layoutMap = {};
        payload.entities.forEach(function (entry) { layoutMap[entry.name] = { x: entry.x, y: entry.y }; });
        if (vscode) vscode.postMessage({ command: 'saveLayout', layout: payload });
        persistState();
      }

      function persistViewState() {
        persistState();
      }

      function persistState() {
        if (!vscode) return;
        vscode.setState({
          layout: { entities: Object.entries(positions).map(function ([name, pos]) { return { name, x: pos.x, y: pos.y }; }) },
          viewportScale,
          viewportTx,
          viewportTy,
          themePreference,
          selectedEntity,
        });
      }

      function observeThemeChanges() {
        const observer = new MutationObserver(function () {
          if (themePreference === 'system') applyTheme();
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      }

      function observeVisibilityChanges() {
        document.addEventListener('visibilitychange', function () {
          if (document.hidden) {
            if (focusEntity) {
              focusOverlaySuppressed = true;
              document.body.classList.remove('focus-mode');
            }
          } else {
            focusOverlaySuppressed = false;
            applyFocusState();
          }
        });
      }

      function normalizeLayout(input) {
        const map = {};
        if (!input || !Array.isArray(input.entities)) return map;
        input.entities.forEach(function (entry) {
          if (entry && typeof entry.name === 'string') map[entry.name] = { x: Number(entry.x) || 0, y: Number(entry.y) || 0 };
        });
        return map;
      }

      function getPalette(name) {
        const palettes = {
          blue: { border: '#4f9dff', body: '#071527f5', header: '#0f2744', nameBg: '#0b1f3a', typeBg: '#3ab0ff' },
          green: { border: '#41e3c4', body: '#031a1cf0', header: '#06302d', nameBg: '#082521', typeBg: '#20f0c0' },
          red: { border: '#ff6b81', body: '#1b0507f5', header: '#3b0a15', nameBg: '#2a0c12', typeBg: '#ff7d9b' },
          purple: { border: '#b785ff', body: '#12061df5', header: '#2a0c45', nameBg: '#1e0f31', typeBg: '#d3a6ff' },
          yellow: { border: '#f6c356', body: '#2a1b05f5', header: '#4a2c05', nameBg: '#3a2204', typeBg: '#ffd56c' },
        };
        return palettes[name] || palettes.blue;
      }
    })();
  </script>
</body>
</html>`;
}

function getNonce() {
  let s = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

 