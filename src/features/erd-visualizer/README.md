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