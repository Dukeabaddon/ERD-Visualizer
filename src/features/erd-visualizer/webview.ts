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
      --edge-dark: #8ca2c7;
      --edge-light: #5c6f91;
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
    .entity-card.edge-hover {
      box-shadow: 0 0 24px rgba(111,198,255,0.45);
      border-color: rgba(111,198,255,0.8);
    }
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

      let layoutMap = Object.keys(savedLayout).length ? savedLayout : (state.layout ? normalizeLayout(state.layout) : {});
      const positions = {};
      const entityMetrics = {};
      let selectedEntity = state.selectedEntity || null;
      let persistTimer = null;
      let zoomRenderTimeout = null;

      applyTheme();
      renderEntities();
      applyViewportTransform();
      attachEventHandlers();
      renderEdges();
      observeThemeChanges();

      function renderEntities() {
        nodesLayer.innerHTML = '';
        Object.keys(entityMetrics).forEach(function (key) { delete entityMetrics[key]; });
        model.entities.forEach(function (entity, index) {
          const palette = getPalette(entity.palette);
          const card = document.createElement('div');
          card.className = 'entity-card';
          card.dataset.entity = entity.name;
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
        });
        highlightSelection();
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
        const margin = 20;
        const span = Math.max(meta.height - margin * 2, 40);
        const compressed = span * 0.75;
        const spacing = count === 1 ? 0 : Math.max(18, compressed / (count - 1));
        const startY = meta.pos.y + margin + (span - compressed) / 2;
        const anchors = [];
        for (let i = 0; i < count; i++) {
          anchors.push({
            x: isOutgoing ? meta.pos.x + meta.width : meta.pos.x,
            y: startY + spacing * i,
          });
        }
        return anchors;
      }

      function buildSmoothPath(start, end, variantOffset) {
        const dir = end.x >= start.x ? 1 : -1;
        const stub = 16 * dir;
        const midX = (start.x + end.x) / 2;
        const bendOffset = ((variantOffset % 6) - 3) * 8;
        return [
          'M', start.x, start.y,
          'L', start.x + stub, start.y,
          'Q', start.x + stub + 24 * dir, start.y + bendOffset, midX, start.y + bendOffset,
          'Q', midX - 24 * dir, end.y - bendOffset, end.x - stub, end.y,
          'L', end.x, end.y
        ].join(' ');
      }

      function createRelationshipGroups(relationships) {
        const map = new Map();
        const groups = [];
        relationships.forEach(function (rel, index) {
          const fromName = rel.from && rel.from.entity;
          const toName = rel.to && rel.to.entity;
          if (!fromName || !toName) return;
          const key = fromName + '→' + toName;
          let group = map.get(key);
          if (!group) {
            group = { from: fromName, to: toName, indexes: [] };
            map.set(key, group);
            groups.push(group);
          }
          group.indexes.push(index);
        });
        return groups;
      }

      function addRelationshipLabel(label, start, end, themeStyles, options) {
        const { cardinality, stackIndex = 0, stackCount = 1 } = options || {};
        const isCardinality = /(\.\.|[*])/i.test(label);
        if (cardinality && isCardinality) {
          const direction = start.x <= end.x ? 1 : -1;
          const yOffset = 6 + stackIndex * 12;
          const y = start.y - yOffset;
          const x = direction > 0 ? start.x + 6 : start.x - 6;
          drawLabel(x, y, label, themeStyles, { alignEnd: direction < 0 });
        } else {
          const centerX = (start.x + end.x) / 2;
          const centerY = (start.y + end.y) / 2 - 8;
          drawLabel(centerX, centerY, label, themeStyles, { alignEnd: false });
        }
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
        text.textContent = textValue;
        text.classList.add('edge-label');
        edgeLabelsSvg.appendChild(text);
      }

      function getThemeStyles(theme) {
        if (theme === 'light') {
          return {
            edge: '#5c6f91',
            highlightEdge: '#387cd6',
            labelText: 'rgba(17,26,44,0.9)'
          };
        }
        return {
          edge: '#8ca2c7',
          highlightEdge: '#9fe6ff',
          labelText: 'rgba(255,255,255,0.9)'
        };
      }

      function updateNodePosition(name) {
        const card = nodesLayer.querySelector('.entity-card[data-entity="' + CSS.escape(name) + '"]');
        if (!card) return;
        const pos = positions[name] || { x: 0, y: 0 };
        card.style.transform = 'translate(' + pos.x + 'px,' + pos.y + 'px)';
      }

      function renderEdges() {
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
        const groups = createRelationshipGroups(model.relationships || []);
        const anchorMaps = buildAnchorMaps(model.entities, groups, nodesLayer, positions);
        const theme = document.body.dataset.theme || 'dark';
        const themeStyles = getThemeStyles(theme);
        groups.forEach(function (group, groupIndex) {
          const startAnchor = anchorMaps.sourceAnchors[groupIndex];
          const endAnchor = anchorMaps.targetAnchors[groupIndex];
          if (!startAnchor || !endAnchor) return;
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const d = buildSmoothPath(startAnchor, endAnchor, groupIndex);
          const edgeColor = themeStyles.edge;
        path.setAttribute('d', d);
          path.setAttribute('stroke', edgeColor);
          path.setAttribute('stroke-width', '2');
          path.setAttribute('fill', 'none');
          path.setAttribute('opacity', '0.9');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          edgesSvg.appendChild(path);
          path.addEventListener('pointerenter', function () {
            path.setAttribute('stroke', themeStyles.highlightEdge || '#aee2ff');
            highlightEntities(group.from, group.to, true);
          });
          path.addEventListener('pointerleave', function () {
            path.setAttribute('stroke', themeStyles.edge);
            highlightEntities(group.from, group.to, false);
          });
          const stackCount = group.indexes.length;
          group.indexes.forEach(function (relIndex, stackIdx) {
            const rel = model.relationships[relIndex];
            if (!rel) return;
            if (rel.cardinality) {
              addRelationshipLabel(rel.cardinality, startAnchor, endAnchor, themeStyles, {
                cardinality: true,
                stackIndex: stackIdx,
                stackCount,
              });
            }
          });
        });
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
        zoomInBtn.addEventListener('click', function () { adjustZoom(1.2); });
        zoomOutBtn.addEventListener('click', function () { adjustZoom(0.8); });
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
            const delta = event.deltaY < 0 ? 1.1 : 0.9;
            const rect = canvasEl.getBoundingClientRect();
            const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            zoomAround(delta, point);
            if (zoomRenderTimeout) clearTimeout(zoomRenderTimeout);
            zoomRenderTimeout = setTimeout(function () {
              renderEdges();
            }, 80);
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
          if (target instanceof HTMLElement && target.closest('.entity-card')) return;
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

        document.addEventListener('keydown', function (event) {
          if ((event.metaKey || event.ctrlKey) && (event.key === '=' || event.key === '+')) {
            event.preventDefault();
            adjustZoom(1.1);
          } else if ((event.metaKey || event.ctrlKey) && event.key === '-') {
            event.preventDefault();
            adjustZoom(0.9);
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
            highlightSelection();
            persistState();
            return;
          }
          selectedEntity = card.dataset.entity || null;
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
        const newScale = Math.max(0.3, Math.min(3.5, viewportScale * factor));
        const worldX = (point.x - viewportTx) / viewportScale;
        const worldY = (point.y - viewportTy) / viewportScale;
        viewportScale = newScale;
        viewportTx = point.x - worldX * viewportScale;
        viewportTy = point.y - worldY * viewportScale;
        applyViewportTransform();
        persistViewState();
      }

      function applyViewportTransform() {
        viewportEl.style.transform = 'translate(' + viewportTx + 'px,' + viewportTy + 'px) scale(' + viewportScale + ')';
      }

      function exportImage(kind) {
        const htmlToImage = window.htmlToImage;
        if (!htmlToImage) return;
        const target = viewportEl.cloneNode(true);
        target.style.transform = 'translate(0px,0px) scale(1)';
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
 