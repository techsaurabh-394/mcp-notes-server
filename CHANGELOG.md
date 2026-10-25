# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- README: `npx -y mcp-notes-server` quick start and setup; npm roadmap item ticked.

## [1.1.1]

First npm release. Version bumped from 1.1.0 to 1.1.1 for publishing; no functional changes.

### Added
- Five SVG diagrams in `docs/images/` (architecture, request flow, tools map, data model, security).
- `CHANGELOG.md` and `SECURITY.md`.
- More store tests (ordering, tag scoring, persistence, no leftover temp file).

### Changed
- README rewritten: quick start, per-tool parameter tables with limits and examples, resources and prompt examples, troubleshooting. Architecture diagram is now an SVG instead of untagged Mermaid.
- `package.json`: added `bugs`, `homepage` and the `notes` keyword; `files` now excludes compiled tests. Version unchanged.
- `CONTRIBUTING.md` now lists the local setup and checks.

## [1.1.0]

### Added
- `get_note` and `update_note` tools.
- Resources `notes://all` and `notes://{id}`.
- `review_notes` prompt.
- End-to-end test over stdio and a GitHub Actions CI workflow.

## [1.0.0]

Never tagged or published; this is the state of the first commits.

### Added
- Initial version: `add_note`, `list_notes`, `search_notes` and `delete_note` backed by a JSON file.

[Unreleased]: https://github.com/techsaurabh-394/mcp-notes-server/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/techsaurabh-394/mcp-notes-server/compare/d977997...v1.1.1
[1.1.0]: https://github.com/techsaurabh-394/mcp-notes-server/commit/d977997
