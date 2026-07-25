# Changelog

All notable changes to this project will be documented in this file.

## [0.1.3] - 2026-07-26

### Fixed
- UTF-8 BOM and leading whitespace broke JSON schema detection
- Alternate JSON `attributes` as objects (and `primaryKey` as arrays) produced empty diagrams
- Non-schema JSON (`{}` / `[]`) no longer falls through to the SQL parser

### Added
- Jest adversarial suite (`src/features/erd-visualizer/parser.test.ts`) covering SQL dialects and JSON shapes
- README: Marketplace total installs badge, input matrix, privacy / uninstall / star history

### Changed
- Jest `testMatch` now picks up `src/**/*.test.ts` (previous config matched nothing under gitignored `test/`)

## [0.1.2] - 2026-01-27

- Package bump / maintenance

## [0.1.1] - 2026-01-27

- Fixed parser issues with nested parentheses in SQL (e.g. `CHECK` constraints, `DEFAULT` functions)
- Lowered minimum VS Code version to `1.85.0`
- Added support for Databricks/Spark SQL syntax
