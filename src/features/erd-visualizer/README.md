ERD Visualizer feature

This feature provides a basic ERD visualization webview for SQL and JSON schema files.

Commands
- `erdVisualizer.open` — visualize the active editor document
- `erdVisualizer.openFromFile` — choose a file to visualize

Notes
- Parser is intentionally minimal and supports common CREATE TABLE / FOREIGN KEY patterns. It will also parse the canonical JSON shape described in the design notes.