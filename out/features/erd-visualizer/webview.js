"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebviewContent = getWebviewContent;
const vscode = __importStar(require("vscode"));
// Minimal, well-formed webview content to ensure TypeScript parses correctly.
function getWebviewContent(webview, extensionUri, model, visualSpec) {
    const nonce = getNonce();
    const data = JSON.stringify(model || { entities: [], relationships: [] });
    const spec = JSON.stringify(visualSpec || { canvas: { grid: 24, background_color: '#1E1E1E' } });
    const keyIconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'resources', 'icons', 'key.svg')).toString();
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ERD Visualizer</title>
  <style>html,body,#svgRoot{height:100%;width:100%;margin:0;padding:0}body{background:#1e1e1e;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto}</style>
</head>
<body>
  <div id="toolbar" style="position:absolute;left:12px;top:12px;z-index:20">
    <button id="exportBtn">Export</button>
    <div id="exportPopover" style="display:none;background:#fff;color:#111;padding:8px;border-radius:6px;box-shadow:0 6px 16px rgba(0,0,0,0.2);position:absolute;left:0;top:32px">
      <label style="display:block;margin-bottom:6px">Background <select id="exportBg"><option value="dark">Dark</option><option value="white">White</option><option value="transparent">Transparent</option></select></label>
      <label style="display:block;margin-bottom:6px">PNG Scale <select id="exportScale"><option value="1">1x</option><option value="2">2x</option></select></label>
      <div style="display:flex;gap:8px"><button id="exportSvg">SVG</button><button id="exportPng">PNG</button></div>
    </div>
  </div>
  <svg id="svgRoot" xmlns="http://www.w3.org/2000/svg"></svg>
  <script nonce="${nonce}">
    (function(){
      const model = ${data};
      const spec = ${spec};
      const keyIcon = '${keyIconUri}';
      const svg = document.getElementById('svgRoot');
      const vscode = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;
      const NS = 'http://www.w3.org/2000/svg';

      // defs + grid
      const defs = document.createElementNS(NS, 'defs');
      if (spec && spec.canvas && spec.canvas.grid) {
        const gridSize = Number(spec.canvas.grid) || 24;
        const pattern = document.createElementNS(NS, 'pattern');
        pattern.setAttribute('id', 'grid');
        pattern.setAttribute('width', String(gridSize));
        pattern.setAttribute('height', String(gridSize));
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', 'M ' + gridSize + ' 0 L ' + gridSize + ' ' + gridSize + ' M 0 ' + gridSize + ' L ' + gridSize + ' ' + gridSize);
        path.setAttribute('stroke', '#2E2E2E');
        path.setAttribute('stroke-opacity', '0.18');
        path.setAttribute('stroke-width', '1');
        pattern.appendChild(path);
        defs.appendChild(pattern);
      }
      svg.appendChild(defs);
      // background rect (for panning and hit testing)
      let bgRect = null;
      if (spec && spec.canvas && spec.canvas.grid) {
        bgRect = document.createElementNS(NS, 'rect');
        bgRect.setAttribute('x', '0'); bgRect.setAttribute('y', '0'); bgRect.setAttribute('width', '100%'); bgRect.setAttribute('height', '100%');
        bgRect.setAttribute('fill', 'url(#grid)');
        bgRect.setAttribute('pointer-events', 'all');
        svg.appendChild(bgRect);
      } else {
        bgRect = document.createElementNS(NS, 'rect');
        bgRect.setAttribute('x', '0'); bgRect.setAttribute('y', '0'); bgRect.setAttribute('width', '100%'); bgRect.setAttribute('height', '100%');
        bgRect.setAttribute('fill', (spec && spec.canvas && spec.canvas.background_color) ? spec.canvas.background_color : '#1E1E1E');
        bgRect.setAttribute('pointer-events', 'all');
        svg.appendChild(bgRect);
      }

      // viewport group to apply pan/zoom
      const viewport = document.createElementNS(NS, 'g'); viewport.setAttribute('id', 'viewport'); svg.appendChild(viewport);

      // viewport transform state
      let viewportTx = 0, viewportTy = 0, viewportScale = 1;
      function applyViewport() { viewport.setAttribute('transform', 'translate(' + viewportTx + ',' + viewportTy + ') scale(' + viewportScale + ')'); }
      applyViewport();

      // basic node rendering: bordered entity boxes with header and rows
      const PAD = 80; const NODE_W = 300; const ROW_H = 20; const HEADER_H = 36;
      const ents = model && model.entities ? model.entities : [];
      for (let i = 0; i < ents.length; i++) {
        const e = ents[i];
        const col = i % 3; const row = Math.floor(i / 3);
        const ex = PAD + col * (NODE_W + PAD);
        const ey = PAD + row * (HEADER_H + ROW_H * 4 + PAD);
        const rows = (e.columns && e.columns.length) ? e.columns.length : 3;
        const h = Math.max(HEADER_H + rows * ROW_H, HEADER_H + ROW_H * 3);

        const g = document.createElementNS(NS, 'g');
        g.setAttribute('transform', 'translate(' + ex + ',' + ey + ')');
        // store world coordinates for this entity for later use
        e._x = ex; e._y = ey; e._w = NODE_W; e._h = h;
        // container rect
        const r = document.createElementNS(NS, 'rect');
        r.setAttribute('width', String(NODE_W)); r.setAttribute('height', String(h)); r.setAttribute('rx', '8');
        r.setAttribute('fill', '#ffffff'); r.setAttribute('stroke', '#999'); r.setAttribute('stroke-width', '1');
        g.appendChild(r);
        // header
        const title = document.createElementNS(NS, 'text');
        title.setAttribute('x', '12'); title.setAttribute('y', String(HEADER_H / 2 + 6)); title.setAttribute('fill', '#111');
        title.setAttribute('font-weight', '600'); title.setAttribute('font-size', '13');
        title.setAttribute('dominant-baseline', 'middle');
        title.textContent = e.name || 'Entity';
        g.appendChild(title);
        // rows
        const cols = e.columns || [];
        for (let ri = 0; ri < Math.max(3, cols.length); ri++) {
          const y = HEADER_H + 8 + ri * ROW_H;
          const leftText = document.createElementNS(NS, 'text');
          leftText.setAttribute('x', '12'); leftText.setAttribute('y', String(y)); leftText.setAttribute('fill', '#222'); leftText.setAttribute('font-size', '12');
          leftText.setAttribute('dominant-baseline', 'middle');
          leftText.textContent = (cols[ri] && (cols[ri].name || cols[ri].column)) ? (cols[ri].name || cols[ri].column) : '';
          g.appendChild(leftText);

          const typeText = document.createElementNS(NS, 'text');
          typeText.setAttribute('x', String(NODE_W - 12)); typeText.setAttribute('y', String(y)); typeText.setAttribute('fill', '#666');
          typeText.setAttribute('font-size', '11'); typeText.setAttribute('text-anchor', 'end'); typeText.setAttribute('dominant-baseline', 'middle');
          const col = cols[ri];
          typeText.textContent = col ? ((col.type || '') + (col.primary ? ' pk' : '')) : '';
          g.appendChild(typeText);

          if (col && (col.primary || col.foreign)) {
            const img = document.createElementNS(NS, 'image');
            img.setAttribute('href', keyIcon);
            img.setAttribute('width', '12'); img.setAttribute('height', '12');
            img.setAttribute('x', String(NODE_W - 14)); img.setAttribute('y', String(y - 6));
            g.appendChild(img);
          }
        }
        viewport.appendChild(g);
      }

      // relationships / edges
      const rels = (model && model.relationships) ? model.relationships : [];
      // prepare counters for parallel edges
      const pairCounts = {};
      for (let ri = 0; ri < rels.length; ri++) {
        const r = rels[ri];
        const fromName = r.from && r.from.entity ? r.from.entity : null;
        const toName = r.to && r.to.entity ? r.to.entity : null;
        if (!fromName || !toName) continue;
        const fromEnt = ents.find(en => en.name === fromName);
        const toEnt = ents.find(en => en.name === toName);
        if (!fromEnt || !toEnt) continue;

        // find rendered positions (same layout logic as above)
        const fi = ents.indexOf(fromEnt); const ti = ents.indexOf(toEnt);
        const fcol = fi % 3; const frow = Math.floor(fi / 3);
        const tcol = ti % 3; const trow = Math.floor(ti / 3);
        const fx = PAD + fcol * (NODE_W + PAD) + NODE_W; // right edge
        const fy = PAD + frow * (HEADER_H + ROW_H * 4 + PAD) + HEADER_H / 2;
        const tx = PAD + tcol * (NODE_W + PAD); // left edge
        const ty = PAD + trow * (HEADER_H + ROW_H * 4 + PAD) + HEADER_H / 2;
        // choose orthogonal routing: move horizontally from source, vertical to target row, then horizontally to target
        const pairKey = fromName + '->' + toName;
        pairCounts[pairKey] = pairCounts[pairKey] || 0;
        const parallelIndex = pairCounts[pairKey]++;

        // base mid x halfway between nodes
        let midX = Math.round((fx + tx) / 2);
        // offset for parallel edges to avoid overlap
        midX += (parallelIndex - 0.5) * 12;

        const d = 'M ' + fx + ' ' + fy + ' L ' + midX + ' ' + fy + ' L ' + midX + ' ' + ty + ' L ' + tx + ' ' + ty;
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', '#666'); path.setAttribute('stroke-width', '1.6'); path.setAttribute('fill', 'none');
        viewport.appendChild(path);

        // midpoint badge: place at center segment midpoint
        if (r.cardinality) {
          const mx = midX; const my = (fy + ty) / 2;
          const tb = document.createElementNS(NS, 'text');
          tb.setAttribute('x', String(mx)); tb.setAttribute('y', String(my)); tb.setAttribute('fill', '#fff');
          tb.setAttribute('font-size', '11'); tb.setAttribute('text-anchor', 'middle'); tb.setAttribute('dominant-baseline', 'middle');
          tb.textContent = r.cardinality;
          viewport.appendChild(tb);
        }
      }

      // Panning (drag background) and node dragging
      let isPanning = false; let panStartX = 0, panStartY = 0, panOrigX = 0, panOrigY = 0;
      bgRect.addEventListener('pointerdown', (ev) => { isPanning = true; panStartX = ev.clientX; panStartY = ev.clientY; panOrigX = viewportTx; panOrigY = viewportTy; try { bgRect.setPointerCapture(ev.pointerId); } catch (e) {} });
      window.addEventListener('pointermove', (ev) => {
        if (isPanning) {
          const dx = ev.clientX - panStartX; const dy = ev.clientY - panStartY;
          viewportTx = panOrigX + dx; viewportTy = panOrigY + dy; applyViewport();
        }
      });
      window.addEventListener('pointerup', (ev) => { if (isPanning) { isPanning = false; try { bgRect.releasePointerCapture(ev.pointerId); } catch (e) {} } });

      // node dragging
      let dragState = null;
      viewport.querySelectorAll('g').forEach((gNode, idx) => {
        gNode.addEventListener('pointerdown', (ev) => {
          ev.stopPropagation();
          const name = ents[idx] && ents[idx].name ? ents[idx].name : null;
          if (!name) return;
          const ent = ents[idx];
          dragState = { id: idx, startX: ev.clientX, startY: ev.clientY, origX: ent._x, origY: ent._y };
          try { gNode.setPointerCapture(ev.pointerId); } catch (e) {}
        });
      });
      window.addEventListener('pointermove', (ev) => {
        if (dragState) {
          const dx = ev.clientX - dragState.startX; const dy = ev.clientY - dragState.startY;
          const worldDx = dx / viewportScale; const worldDy = dy / viewportScale;
          const ent = ents[dragState.id];
          ent._x = dragState.origX + worldDx; ent._y = dragState.origY + worldDy;
          const node = viewport.querySelectorAll('g')[dragState.id];
          if (node) node.setAttribute('transform', 'translate(' + ent._x + ',' + ent._y + ')');
        }
      });
      window.addEventListener('pointerup', (ev) => {
        if (dragState) {
          try { const node = viewport.querySelectorAll('g')[dragState.id]; node.releasePointerCapture(ev.pointerId); } catch (e) {}
          // post layout to extension host to persist
          if (vscode) {
            try {
              const layout = { entities: ents.map(en => ({ name: en.name, x: en._x, y: en._y })) };
              vscode.postMessage({ command: 'saveLayout', layout });
            } catch (e) { /* ignore */ }
          }
          dragState = null;
        }
      });

      // wheel zoom (Ctrl/Cmd + wheel)
      svg.addEventListener('wheel', (ev) => {
        if (!(ev.ctrlKey || ev.metaKey)) return;
        ev.preventDefault();
        const delta = -ev.deltaY * 0.001;
        const newScale = Math.max(0.2, Math.min(3, viewportScale * (1 + delta)));
        const rect = svg.getBoundingClientRect();
        const px = ev.clientX - rect.left; const py = ev.clientY - rect.top;
        const wx = (px - viewportTx) / viewportScale; const wy = (py - viewportTy) / viewportScale;
        viewportScale = newScale;
        viewportTx = px - wx * viewportScale; viewportTy = py - wy * viewportScale;
        applyViewport();
      }, { passive: false });

      // export popover handlers
      const expBtn = document.getElementById('exportBtn'); const pop = document.getElementById('exportPopover');
      expBtn.addEventListener('click', (e) => { e.stopPropagation(); pop.style.display = pop.style.display === 'none' ? 'block' : 'none'; });
      document.addEventListener('click', (e) => { if (!expBtn.contains(e.target) && !pop.contains(e.target)) pop.style.display = 'none'; });

      document.getElementById('exportSvg').addEventListener('click', () => {
        try {
          const clone = svg.cloneNode(true);
          const exportBg = (document.getElementById('exportBg') as HTMLSelectElement).value || 'dark';
          if (exportBg !== 'transparent') {
            const bgRect = document.createElementNS(NS, 'rect');
            bgRect.setAttribute('x', '0'); bgRect.setAttribute('y', '0'); bgRect.setAttribute('width', '100%'); bgRect.setAttribute('height', '100%');
            bgRect.setAttribute('fill', exportBg === 'white' ? '#ffffff' : (spec.canvas && spec.canvas.background_color ? spec.canvas.background_color : '#1E1E1E'));
            clone.insertBefore(bgRect, clone.firstChild);
          }
          const serializer = new XMLSerializer(); const svgStr = serializer.serializeToString(clone);
          const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }); const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'erd.svg'; a.click(); URL.revokeObjectURL(url);
        } catch (e) { console.error(e); }
      });

      document.getElementById('exportPng').addEventListener('click', () => {
        try {
          const serializer = new XMLSerializer(); const svgStr = serializer.serializeToString(svg);
          const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }); const url = URL.createObjectURL(svgBlob);
          const img = new Image(); img.onload = () => {
            const scale = Number((document.getElementById('exportScale') || { value: '1' }).value) || 1;
            const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale); const ctx = canvas.getContext('2d');
            const exportBg = (document.getElementById('exportBg') as HTMLSelectElement).value || 'dark';
            if (exportBg === 'white') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height); }
            else if (exportBg === 'dark') { ctx.fillStyle = (spec.canvas && spec.canvas.background_color) ? spec.canvas.background_color : '#1E1E1E'; ctx.fillRect(0,0,canvas.width,canvas.height); }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((b) => { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'erd.png'; a.click(); URL.revokeObjectURL(u); });
            URL.revokeObjectURL(url);
          };
          img.src = url;
        } catch (e) { console.error(e); }
      });
    })();
  </script>
</body>
</html>`;
}
function getWebviewNonce() {
    let s = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++)
        s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
}
// keep an alias for compatibility
function getNonce() { return getWebviewNonce(); }
//# sourceMappingURL=webview.js.map