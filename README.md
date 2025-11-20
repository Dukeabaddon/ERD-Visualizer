# ERD Visualizer for VS Code

> Design, inspect, and share database schemas without ever leaving your editor.

[![Install in VS Code](https://img.shields.io/badge/VS%20Code-Install%20Extension-007ACC?logo=visualstudiocode&logoColor=white)](vscode:extension/publisher-id.erd-visualizer)
[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](#release-notes)
[![Build Status](https://img.shields.io/badge/tests-pending-gray.svg)](#testing)

---

- **Local-first**: parses SQL DDL and canonical JSON directly inside VS Code—no cloud services, no data leaks.
- **Interactive canvas**: pan, zoom, drag, and persist layouts per document; PK/FK badges and relationship inference keep diagrams readable.
- **One-click access**: Command Palette entries plus the editor-title icon put the visualizer within reach for every schema file.
- **Export ready**: SVG/PNG export with background controls makes it easy to drop diagrams into docs, wikis, or PRs.

---

## Quick Start

1. **Install**  
   - Marketplace: click the badge above (updates `vscode:extension/publisher-id.erd-visualizer` once published).  
   - Manual: clone this repo, run `pnpm install && pnpm run compile`, then press `F5` in VS Code to launch an Extension Development Host.
2. **Open a schema** (`.sql` or canonical `.json`) and click the ERD icon in the editor title or run `ERD: Visualize current schema`.
3. **Arrange & annotate**: drag tables, watch connectors reroute, and let the layout persist with your workspace.
4. **Export**: open the toolbar popover to capture SVG/PNG in dark, light, or transparent backgrounds.

---

## Feature Highlights

### Preview ERDs from SQL & JSON

Supports common SQL dialects (`CREATE TABLE`, `FOREIGN KEY`) as well as the JSON shape `{ entities: [], relationships: [] }`.

- Detects entities, columns, PK/FK constraints, and cardinality.
- Normalizes mixed schemas (attributes vs. columns) into a consistent model.
- Handles large files through streaming parsing.

![Schema preview](https://images.unsplash.com/photo-1523475472560-d2df97ec485c?auto=format&fit=crop&w=1600&q=80 "Replace with real screenshot")

### Designer Controls & Layout Persistence

- Pan/zoom with mouse, trackpad, or keyboard shortcuts.
- Drag tables freely; connectors reroute in real time.
- Layouts persist to VS Code `workspaceState`, keyed per document URI.

![Designer controls](https://images.unsplash.com/photo-1483478550801-ceba5fe50e8e?auto=format&fit=crop&w=1600&q=80 "Replace with real screenshot")

### Semantic Badges & Relationship Inference

- PK/FK glyphs live inline with column definitions (including tooltips for accessibility).
- Center badges display inferred cardinality (`1:1`, `1:N`, `N:M`), with dashed overlays for join tables.
- Connector heuristics keep edges off entity boxes for cleaner diagrams.

![Relationship badges](https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80 "Replace with real screenshot")

### Export-Ready Output

- Export popover with background + scale controls.
- SVG preserves vector fidelity; PNG honors the selected background.
- Exports reuse your saved layout so screenshots and docs stay in sync.

![Export toolbar](https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=1600&q=80 "Replace with real screenshot")

---

## Commands & Entry Points

| Command | Description |
| --- | --- |
| `ERD: Visualize current schema` (`erdVisualizer.open`) | Open the visualizer for the active editor. |
| `ERD: Visualize current editor` (`erdVisualizer.openForEditor`) | Triggered by the editor-title icon; supports multi-pane workflows. |
| `ERD: Visualize schema from file` (`erdVisualizer.openFromFile`) | Prompt for any `.sql`/`.json` file and generate a diagram. |

The editor-title icon automatically appears for JSON/SQL files (based on `resourceLangId` / extension) so you can launch the webview without the Command Palette.

---

## Installation & Development

```bash
git clone https://github.com/your-org/erd-visualizer-extension.git
cd erd-visualizer-extension
pnpm install
pnpm run compile        # builds to /out and copies resources
# Press F5 in VS Code to launch the Extension Development Host
```

- **Tests**: `pnpm test` (Jest) + `pnpm run test:contrib` (ensures editor/title contribution integrity).  
- **Linting**: ESLint/Prettier recommended (configure per team standards).  
- **Specs & proposals**: see `openspec/` for change tracking and implementation notes.

---

## Release Notes

### 0.1.0 (Preview)

- Command palette + editor-title icon to launch the ERD visualizer.
- JSON + SQL parsing pipeline with normalization into `SchemaModel`.
- Interactive SVG canvas with pan/zoom/drag, layout persistence, PK/FK glyphs, cardinality badges.
- Export popover (SVG/PNG, background selector, resolution scaling).

See `openspec/changes/` for detailed proposals and upcoming iterations.

---

## Roadmap

- Relationship badges with join-table callouts (N:M).
- Theme-aware styling presets (dark + light parity).
- Performance mode for 100+ entity diagrams.
- Explorer context menu + telemetry (opt-in) for usage insights.

---

## Support & Feedback

- **Issues / Feature Requests**: [open an issue](https://github.com/your-org/erd-visualizer-extension/issues).
- **Specs & design decisions**: tracked in `openspec/project.md` and related change folders.
- **Community**: contributions welcome—fork, branch off `feat/<topic>`, and submit PRs following OpenSpec tasks.

---

© 2025 Your Organization — Released under the MIT License. Replace placeholder marketplace link & screenshots before publishing.

