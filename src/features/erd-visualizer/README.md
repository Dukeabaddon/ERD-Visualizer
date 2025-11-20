ERD Visualizer feature

This feature provides a basic ERD visualization webview for SQL and JSON schema files.

Commands
- `erdVisualizer.open` — visualize the active editor document
- `erdVisualizer.openForEditor` — visualize a specific editor (used by the editor-title icon)
- `erdVisualizer.openFromFile` — choose a file to visualize

Editor title icon
- JSON and SQL documents surface an ERD icon in the editor title area. Selecting it runs `erdVisualizer.openForEditor`, so users can open the visualizer without the Command Palette.

Notes
- Parser is intentionally minimal and supports common CREATE TABLE / FOREIGN KEY patterns. It will also parse the canonical JSON shape described in the design notes.
- Connectors are rendered as orthogonal 2 px "pipelines". Relationships that share the same source/target collapse into a single bus with stacked cardinality labels and warning indicators when the stack exceeds six entries.
- Hovering or focusing a connector highlights the pipe, anchor dots, and connected entity cards. Keyboard users can Tab to a card to preview its relationships and press Enter/Space to toggle focus mode.
- Focus mode (click a card, or press Enter on a focused card) dims unrelated tables and keeps the selected table plus immediate neighbors vivid. Click the background or press Escape to exit.
- Trackpad zoom is debounced—line reroutes settle after the pinch gesture pauses (~80 ms)—and entity slot calculations are cached to keep panning/zooming smooth.
- Exports (PNG/SVG/PDF) capture the exact on-screen state, including focus dimming, hover highlights, and anchor dots. Use the gear menu to select background color and scale before exporting.