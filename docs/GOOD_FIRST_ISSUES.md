# Good first issues (paste each as a new issue, label: good first issue)

## 1. Add an `import_notes` tool that reads the Markdown produced by `export_notes`

`export_notes` writes notes as Markdown sections, but there is no way to bring them back. Add an `import_notes` tool (zod schema, annotations: not read-only, not destructive) that accepts the Markdown text, skips notes whose id already exists, respects the limits in `LIMITS` (`src/store.ts`), and returns how many notes were added and skipped.

Acceptance: unit tests for the parser in `src/test/store.test.ts`, an e2e call in `src/test/e2e.test.ts`, README tool table updated.

## 2. Return a clear message when a search has too many results trimmed

`search_notes` returns at most `limit` notes but does not say when more matched. Make the result end with a line such as `Showing 5 of 12 matches. Raise limit (max 20) to see more.` only when results were trimmed.

Acceptance: `NoteStore.search` or the tool handler reports the total, tests for trimmed and not-trimmed cases, no change to output when nothing is trimmed.

## 3. Add a `--version` and `--help` flag to the CLI

Running `npx mcp-notes-server --help` currently starts the stdio server and waits. Handle `--version` (print the package version) and `--help` (print env vars `NOTES_FILE`, `NOTES_CONFIRM_DELETE`, `NOTES_CONFIRM_MODE`, `NOTES_AUDIT_FILE`) and exit 0. Output goes to stdout only in these two cases; the normal server mode must still keep stdout clean.

Acceptance: a test that spawns the built server with each flag and checks the output and exit code; README mentions the flags.
