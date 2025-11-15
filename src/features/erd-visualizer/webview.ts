import * as vscode from 'vscode';
import { SchemaModel } from './model';

export function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, model: SchemaModel): string {
  const nonce = getNonce();
  const data = JSON.stringify(model || { entities: [], relationships: [] });
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ERD Visualizer</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; height: 100vh; display:flex; flex-direction:column; }
  #toolbar { padding: 8px; background: #f3f3f3; border-bottom: 1px solid #ddd; display:flex; gap:8px; align-items:center }
  #canvasWrap { flex:1; overflow: auto; position:relative; background: #2b2b2b; }
  svg { width:100%; height:100%; }
  .node { fill: #ffffff; stroke: #333; stroke-width:1px; }
  .node-title { font-weight:600; font-size:13px; fill:#111 }
  .col { font-size:12px; fill:#111 }
  .col-type { font-size:11px; fill:#666 }
  .edge { stroke:#666; stroke-width:1.6px; fill:none }
  .badge { font-size: 11px; fill:#555 }
  .details { position: absolute; right: 8px; top: 48px; width: 280px; background: rgba(255,255,255,0.95); border: 1px solid #ddd; padding: 8px; max-height: 80vh; overflow:auto }
  button { padding: 6px 8px }
</style>
</head>
<body>
  <div id="toolbar">
    <button id="fit">Fit</button>
    <button id="exportSvg">Export SVG</button>
    <button id="exportPng">Export PNG</button>
    <span id="info" style="margin-left:8px;color:#333"></span>
  </div>
  <div id="canvasWrap"><svg id="svgRoot" xmlns="http://www.w3.org/2000/svg"></svg></div>
  <div id="details" class="details" style="display:none"></div>

<script nonce="${nonce}">
(function(){
  const model = ${data};
  const svg = document.getElementById('svgRoot');
  const NS = 'http://www.w3.org/2000/svg';

  // layout constants
  const PAD_X = 36, PAD_Y = 36, NODE_W = 260, ROW_H = 26, HEADER_H = 34;
  const PALETTE = ['#E6B800','#4FBF77','#4EA8F5','#A66BFF','#FF7A7A'];

  if (!model || !model.entities || model.entities.length === 0) {
    svg.innerHTML = '';
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', '20');
    t.setAttribute('y', '40');
    t.setAttribute('fill', '#999');
    t.textContent = 'No entities found in the opened file.';
    svg.appendChild(t);
    document.getElementById('info').textContent = '0 entities, 0 relationships';
    return;
  }

  // compute grid layout
  const total = model.entities.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
  model.entities.forEach((e, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = PAD_X + col * (NODE_W + PAD_X);
    const h = Math.max(HEADER_H + (e.columns ? e.columns.length * ROW_H : ROW_H), HEADER_H + ROW_H * 3);
    const y = PAD_Y + row * (h + PAD_Y);
    e._x = x; e._y = y; e._w = NODE_W; e._h = h; e._idx = idx;
  });

  // helpers
  function createText(text, x, y, className) {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', String(x));
    t.setAttribute('y', String(y));
    if (className) t.setAttribute('class', className);
    t.setAttribute('dominant-baseline', 'middle');
    t.textContent = text;
    return t;
  }

  function indexOfColumn(entity, name) {
    if (!entity || !entity.columns) return 0;
    const i = entity.columns.findIndex(c => c.name === name);
    return i === -1 ? 0 : i;
  }

  function anchorForColumn(entity, colName, other) {
    // compute which side (left/right/top/bottom) to anchor to and return {x,y,side}
    const ex = entity._x, ey = entity._y, ew = entity._w, eh = entity._h;
    const ox = other._x + other._w/2, oy = other._y + other._h/2;
    const cx = ex + ew/2, cy = ey + eh/2;
    const dx = ox - cx, dy = oy - cy;
    const idx = indexOfColumn(entity, colName);
    if (Math.abs(dx) > Math.abs(dy)) {
      // left or right
      if (dx > 0) {
        return { x: ex + ew, y: ey + HEADER_H/2 + idx * ROW_H, side: 'right' };
      }
      return { x: ex, y: ey + HEADER_H/2 + idx * ROW_H, side: 'left' };
    }
    // top or bottom
    if (dy > 0) {
      return { x: ex + 20 + Math.min(ew - 40, idx * 10), y: ey + eh, side: 'bottom' };
    }
    return { x: ex + 20 + Math.min(ew - 40, idx * 10), y: ey, side: 'top' };
  }

  function bezierPath(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const offset = Math.min(200, Math.max(40, dist * 0.35));
    const cx1 = a.x + (a.side === 'left' ? -offset : (a.side === 'right' ? offset : 0));
    const cy1 = a.y + (a.side === 'top' ? -offset : (a.side === 'bottom' ? offset : 0));
    const cx2 = b.x + (b.side === 'left' ? -offset : (b.side === 'right' ? offset : 0));
    const cy2 = b.y + (b.side === 'top' ? -offset : (b.side === 'bottom' ? offset : 0));
  return 'M ' + a.x + ' ' + a.y + ' C ' + cx1 + ' ' + cy1 + ' ' + cx2 + ' ' + cy2 + ' ' + b.x + ' ' + b.y;
  }

  // draw nodes
  model.entities.forEach(e => {
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('transform', 'translate(' + e._x + ',' + e._y + ')');
    g.setAttribute('data-entity', e.name);

    // outer rect
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('width', String(e._w));
    rect.setAttribute('height', String(e._h));
    rect.setAttribute('rx', '8');
    rect.setAttribute('class', 'node');
    rect.setAttribute('fill', '#ffffff');
    rect.setAttribute('stroke', '#aaa');
    g.appendChild(rect);

    // header band
    const header = document.createElementNS(NS, 'rect');
    header.setAttribute('x', '0');
    header.setAttribute('y', '0');
    header.setAttribute('width', String(e._w));
    header.setAttribute('height', String(HEADER_H));
    header.setAttribute('fill', PALETTE[e._idx % PALETTE.length]);
    header.setAttribute('rx', '8');
    header.setAttribute('stroke', PALETTE[e._idx % PALETTE.length]);
    g.appendChild(header);

    // title
    const title = createText(e.name, 12, HEADER_H/2, 'node-title');
    g.appendChild(title);

    // columns
    (e.columns || []).forEach((c, i) => {
      const y = HEADER_H + 10 + i * ROW_H;
      const colG = document.createElementNS(NS, 'g');
  colG.setAttribute('transform', 'translate(0,' + y + ')');

      // left-side name
      const nameText = createText(c.name, 12, 0, 'col');
      nameText.setAttribute('cursor', 'pointer');
      nameText.addEventListener('click', () => showDetails(e, c));
      colG.appendChild(nameText);

      // right-side type and pk marker
      const typeText = createText((c.type || '') + (c.primary ? ' pk' : ''), e._w - 12, 0, 'col-type');
      typeText.setAttribute('text-anchor', 'end');
      colG.appendChild(typeText);

      // small pk/fk glyph as circle or diamond
      if (c.primary || c.foreign) {
        const glyph = document.createElementNS(NS, 'circle');
        glyph.setAttribute('cx', '6');
        glyph.setAttribute('cy', '0');
        glyph.setAttribute('r', '4');
        glyph.setAttribute('fill', c.primary ? '#444' : '#777');
        colG.appendChild(glyph);
      }

      g.appendChild(colG);
    });

    svg.appendChild(g);
  });

  // draw edges
  model.relationships = model.relationships || [];
  model.relationships.forEach(r => {
    const from = model.entities.find(en => en.name === r.from.entity);
    const to = model.entities.find(en => en.name === r.to.entity);
    if (!from || !to) return;
    const a = anchorForColumn(from, r.from.column, to);
    const b = anchorForColumn(to, r.to.column, from);

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', bezierPath(a, b));
    path.setAttribute('class', 'edge');
    path.setAttribute('stroke', '#666');
    path.setAttribute('fill', 'none');
    svg.appendChild(path);

    // optional label
    if (r.cardinality) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const text = createText(r.cardinality, mx, my, 'badge');
      svg.appendChild(text);
    }
  });

  document.getElementById('fit').addEventListener('click', () => {
    try {
      const bbox = svg.getBBox();
      svg.setAttribute('viewBox', String(bbox.x - 20) + ' ' + String(bbox.y - 20) + ' ' + String(bbox.width + 40) + ' ' + String(bbox.height + 40));
    } catch (e) { /* ignore */ }
  });

  document.getElementById('exportSvg').addEventListener('click', () => {
    try {
      const clone = svg.cloneNode(true);
      const bbox = svg.getBBox();
      const bg = document.createElementNS(NS, 'rect');
      bg.setAttribute('x', String(bbox.x - 20));
      bg.setAttribute('y', String(bbox.y - 20));
      bg.setAttribute('width', String(bbox.width + 40));
      bg.setAttribute('height', String(bbox.height + 40));
      bg.setAttribute('fill', '#ffffff');
      clone.insertBefore(bg, clone.firstChild);
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(clone);
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'erd.svg'; a.click(); URL.revokeObjectURL(url);
    } catch (e) { console.error(e); }
  });

  document.getElementById('exportPng').addEventListener('click', () => {
    try {
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(svg);
      const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(800, img.width);
        canvas.height = Math.max(600, img.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img, 0,0);
        canvas.toBlob((b) => {
          const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'erd.png'; a.click(); URL.revokeObjectURL(u);
        });
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (e) { console.error(e); }
  });

  document.getElementById('info').textContent = String(model.entities.length) + ' entities, ' + String(model.relationships.length) + ' relationships';

  function showDetails(entity, column) {
    const details = document.getElementById('details');
    details.style.display = 'block';
    details.innerHTML = '<h3>' + entity.name + '</h3>' +
      '<p><strong>Column:</strong> ' + column.name + ' ' + (column.primary ? '(PK)' : '') + '</p>' +
      '<pre>' + JSON.stringify(column, null, 2) + '</pre>' +
      "<button id='goto'>Go to source</button>";
    document.getElementById('goto').addEventListener('click', () => {
      const vscode = acquireVsCodeApi();
      vscode.postMessage({ command: 'reveal', entity: entity.name, column: column.name });
    });
  }

})();
</script>
</body>
</html>`;
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
 