import * as vscode from 'vscode';
import { SchemaModel } from './model';

export function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, model: SchemaModel): string {
  const nonce = getNonce();
  const data = JSON.stringify(model);
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
  #canvasWrap { flex:1; overflow: auto; position:relative; }
  svg { width:100%; height:100%; }
  .node { fill: #fff; stroke: #333; stroke-width:1px; }
  .node-title { font-weight:600; }
  .edge { stroke:#666; stroke-width:1.5px; fill:none }
  .badge { font-size: 11px; fill:#555 }
  .details { position: absolute; right: 8px; top: 48px; width: 280px; background: rgba(255,255,255,0.95); border: 1px solid #ddd; padding: 8px; max-height: 80vh; overflow:auto }
</style>
</head>
<body>
  <div id="toolbar">
    <button id="fit">Fit</button>
    <button id="exportSvg">Export SVG</button>
    <button id="exportPng">Export PNG</button>
    <span id="info"></span>
  </div>
  <div id="canvasWrap"><svg id="svgRoot"></svg></div>
  <div id="details" class="details" style="display:none"></div>

<script nonce="${nonce}">
(function(){
  const model = ${data};
  const svg = document.getElementById('svgRoot');
  const NS = 'http://www.w3.org/2000/svg';
  const PAD_X = 20, PAD_Y = 20, COL_W = 200, ROW_H = 24;

  // simple layout: columns of nodes placed in grid by number of cols
  const cols = Math.max(1, Math.ceil(Math.sqrt(model.entities.length)));
  const rows = Math.ceil(model.entities.length / cols);

  model.entities.forEach((e, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = PAD_X + col * (COL_W + PAD_X);
    const y = PAD_Y + row * (ROW_H * Math.max(3, e.columns.length) + PAD_Y);
    e._x = x; e._y = y; e._idx = idx;
  });

  // helper to render inline glyphs for PK/FK
  function iconSvgForColumn(col) {
    if (col.primary) return '<svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M22 8.29344C22 11.7692 19.1708 14.5869 15.6807 14.5869C15.0439 14.5869 13.5939 14.4405 12.8885 13.8551L12.0067 14.7333C11.4883 15.2496 11.6283 15.4016 11.8589 15.652C11.9551 15.7565 12.0672 15.8781 12.1537 16.0505C12.1537 16.0505 12.8885 17.075 12.1537 18.0995C11.7128 18.6849 10.4783 19.5045 9.06754 18.0995L8.77362 18.3922C8.77362 18.3922 9.65538 19.4167 8.92058 20.4412C8.4797 21.0267 7.30403 21.6121 6.27531 20.5876L5.2466 21.6121C4.54119 22.3146 3.67905 21.9048 3.33616 21.6121L2.45441 20.7339C1.63143 19.9143 2.1115 19.0264 2.45441 18.6849L10.0963 11.0743C10.0963 11.0743 9.3615 9.90338 9.3615 8.29344C9.3615 4.81767 12.1907 2 15.6807 2C19.1708 2 22 4.81767 22 8.29344ZM15.681 10.4889C16.8984 10.4889 17.8853 9.50601 17.8853 8.29353C17.8853 7.08105 16.8984 6.09814 15.681 6.09814C14.4635 6.09814 13.4766 7.08105 13.4766 8.29353C13.4766 9.50601 14.4635 10.4889 15.681 10.4889Z" fill="#444"/></svg>';
    if (col.foreign) return '<svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 13a5 5 0 017-7l1 1-1 1a3 3 0 00-4 4l-1 1-3-3 1-1 3 3z" fill="#444"/></svg>';
    return '';
  }

  // render nodes
  model.entities.forEach(e => {
    const g = document.createElementNS(NS, 'g');
  g.setAttribute('transform', 'translate(' + e._x + ',' + e._y + ')');
    g.setAttribute('data-entity', e.name);

    const w = COL_W;
    const h = Math.max(30, e.columns.length * ROW_H + 30);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('rx', '6');
    rect.setAttribute('class', 'node');
    g.appendChild(rect);

    const title = document.createElementNS(NS, 'text');
    title.setAttribute('x', '10');
    title.setAttribute('y', '18');
    title.setAttribute('class', 'node-title');
    title.textContent = e.name;
    g.appendChild(title);

    e.columns.forEach((c, i) => {
      const y = 36 + i * ROW_H;
      // create a group for icon + text
      const rowG = document.createElementNS(NS, 'g');
      rowG.setAttribute('transform', 'translate(0,' + y + ')');

      // icon (render as foreignObject for inline SVG or use SVG fragments)
      const iconSvg = iconSvgForColumn(c);
      if (iconSvg) {
        const fo = document.createElementNS(NS, 'foreignObject');
        fo.setAttribute('x', '6');
        fo.setAttribute('y', String(-10));
        fo.setAttribute('width', '14');
        fo.setAttribute('height', '14');
        fo.innerHTML = iconSvg;
        rowG.appendChild(fo);
      }

      const t = document.createElementNS(NS, 'text');
      const textX = iconSvg ? 26 : 10;
      t.setAttribute('x', String(textX));
      t.setAttribute('y', '0');
      t.setAttribute('class', 'col');
      t.setAttribute('dominant-baseline', 'middle');
      t.textContent = c.name;
      t.style.cursor = 'pointer';
      t.addEventListener('click', () => showDetails(e, c));
      rowG.appendChild(t);
      g.appendChild(rowG);
    });

    svg.appendChild(g);
      const PAD_X = 60, PAD_Y = 60, COL_W = 220, ROW_H = 28;
      const PALETTE = ['#E6B800','#4FBF77','#4EA8F5','#A66BFF','#FF7A7A'];

  // render edges with smoother routing
  function anchorPoint(entity, other) {
    const ex = entity._x, ey = entity._y;
    const ew = COL_W, eh = Math.max(30, entity.columns.length * ROW_H + 30);
    const cx = ex + ew/2, cy = ey + eh/2;
    const ox = other._x + COL_W/2, oy = other._y + Math.max(30, other.columns.length * ROW_H + 30)/2;
    const dx = ox - cx, dy = oy - cy;
    // decide side
    if (Math.abs(dx) > Math.abs(dy)) {
      // horizontal anchor
      if (dx > 0) return { x: ex + ew, y: ey + 20 + indexOfColumn(entity, '') * ROW_H + 6, side: 'right' };
      return { x: ex, y: ey + 20 + indexOfColumn(entity, '') * ROW_H + 6, side: 'left' };
    } else {
      if (dy > 0) return { x: ex + ew/2, y: ey + eh, side: 'bottom' };
      return { x: ex + ew/2, y: ey, side: 'top' };
    }
  }

  function anchorForColumn(entity, colName, other) {
    const base = anchorPoint(entity, other);
    // try to position anchor y based on column index when anchored left/right
    const idx = indexOfColumn(entity, colName);
    if (base.side === 'right' || base.side === 'left') {
      const y = entity._y + 20 + idx * ROW_H + 6;
      return { x: base.x, y, side: base.side };
    } else {
      // top/bottom anchors: x align to column position (approx)
      const x = entity._x + 10 + Math.min(120, idx * 6);
        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(h));
        rect.setAttribute('rx', '8');
        rect.setAttribute('fill', '#ffffff');
        rect.setAttribute('stroke', PALETTE[e._idx % PALETTE.length] || '#888');
        rect.setAttribute('stroke-width', '2');
        g.appendChild(rect);

        // header band
        const header = document.createElementNS(NS, 'rect');
        header.setAttribute('x', '0');
        header.setAttribute('y', '0');
        header.setAttribute('width', String(w));
        header.setAttribute('height', '30');
        header.setAttribute('rx', '8');
        header.setAttribute('fill', PALETTE[e._idx % PALETTE.length]);
        header.setAttribute('stroke', PALETTE[e._idx % PALETTE.length]);
        header.setAttribute('stroke-width', '1');
        g.appendChild(header);

    const dy = ey - sy;
        title.setAttribute('x', '12');
        title.setAttribute('y', '20');
    // control points along the line normal to the direction
    const cx1 = sx + (dx > 0 ? offset : -offset);
    const cy1 = sy;
    const cx2 = ex + (dx > 0 ? -offset : offset);
    const cy2 = ey;
          const y = 38 + i * ROW_H;
  }

  model.relationships.forEach((r, idx) => {
    const from = model.entities.find(en => en.name === r.from.entity);
    const to = model.entities.find(en => en.name === r.to.entity);
    if (!from || !to) return;
    const a = anchorForColumn(from, r.from.column, to);
            const fo = document.createElementNS(NS, 'foreignObject');
            fo.setAttribute('x', '8');
            fo.setAttribute('y', String(-10));
    path.setAttribute('d', d);
    path.setAttribute('class', 'edge');
    svg.appendChild(path);

    // label
    const mx = (a.x + b.x)/2;
    const my = (a.y + b.y)/2;
          const textX = iconSvg ? 30 : 12;
    text.setAttribute('x', String(mx));
    text.setAttribute('y', String(my));
    text.setAttribute('class', 'badge');
    text.textContent = r.cardinality || '';
          t.setAttribute('fill', '#111');
          t.textContent = c.name;
  });

  function indexOfColumn(entity, colName) {

          // type and small pk badge on right
          const typeText = document.createElementNS(NS, 'text');
          typeText.setAttribute('x', String(w - 12));
          typeText.setAttribute('y', '0');
          typeText.setAttribute('text-anchor', 'end');
          typeText.setAttribute('dominant-baseline', 'middle');
          typeText.setAttribute('class', 'col-type');
          typeText.setAttribute('fill', '#666');
          const typeLabel = c.type || '';
          const pkLabel = c.primary ? ' pk' : '';
          typeText.textContent = typeLabel + pkLabel;
          rowG.appendChild(typeText);
          g.appendChild(rowG);
    if (!entity || !entity.columns) return 0;
    const i = entity.columns.findIndex(c => c.name === colName);
    return i === -1 ? 0 : i;
  }

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

  document.getElementById('fit').addEventListener('click', () => {
    // naive fit: set viewBox to bounds
  const bbox = svg.getBBox();
  svg.setAttribute('viewBox', (bbox.x-20) + ' ' + (bbox.y-20) + ' ' + (bbox.width+40) + ' ' + (bbox.height+40));
  });

  document.getElementById('exportSvg').addEventListener('click', () => {
    // ensure exported svg has a white background and inline styles preserved
    const clone = svg.cloneNode(true);
    const bbox = svg.getBBox();
    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('x', String(bbox.x - 20));
    bg.setAttribute('y', String(bbox.y - 20));
    bg.setAttribute('width', String(bbox.width + 40));
    bg.setAttribute('height', String(bbox.height + 40));
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);
    // serialize
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(clone);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'erd.svg';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('exportPng').addEventListener('click', () => {
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const img = new Image();
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const offset = Math.min(220, Math.max(60, dist * 0.45));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width || 1200;
      canvas.height = img.height || 800;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img, 0,0);
      canvas.toBlob((b) => {
        const u = URL.createObjectURL(b);
        const a = document.createElement('a');
        a.href = u;
        a.download = 'erd.png';
        a.click();
        URL.revokeObjectURL(u);
      });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });

  document.getElementById('info').textContent = model.entities.length + ' entities, ' + model.relationships.length + ' relationships';
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
