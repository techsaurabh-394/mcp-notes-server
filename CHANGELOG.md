# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.2.0]

### Added
- `export_notes` tool (Markdown export).
- Input limits enforced in the store: title 200 chars without line breaks, content 20,000 chars without NUL, 10 tags of at most 50 chars, 5,000 notes. Clear error messages; nothing is stored on rejection.
- Lock file (`<notes file>.lock`) around every read-modify-write, with stale-lock cleanup after 30 s. Tests include four separate OS processes writing at once.
- A notes file with malformed entries is refused instead of overwritten.
- Optional human approval for `delete_note` via mcp-safe-actions (`NOTES_CONFIRM_DELETE=1`), off by default.
- `openWorldHint: false` and full annotations on all tools; server version now read from `package.json`.
- `npm run lint` and `npm run coverage`; CI on Node 18, 20, 22 with coverage summary; opt-in npm release workflow.
- CODE_OF_CONDUCT, CITATION.cff, issue template config, demo script, repository settings notes.

### Changed
- README rewritten; diagrams moved from `docs/images/` to three animated SVGs in `assets/`.
- E2E tests split per scenario and now cover invalid input, empty results and unknown ids for every tool.

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
