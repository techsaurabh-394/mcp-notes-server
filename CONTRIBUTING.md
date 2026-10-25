# Contributing to mcp-notes-server

Thanks for your interest. Small, focused pull requests are easiest to review.

1. Open an issue first for anything bigger than a small fix, so we can agree on the approach.
2. Fork the repo and create a branch from `main`.
3. Make your change, add or update tests where it makes sense.
4. Run the checks below.
5. Open a pull request using the template.

## Local setup

You need Node.js 18 or newer.

```bash
npm install
npm run build     # compiles src/ to dist/
npm test          # builds, then runs node --test on dist/test/*.test.js
```

`npm run dev` runs `tsc --watch`. There is no separate linter; `tsc` runs in strict mode as part of the build.

## Guidelines

- Keep the README in step with the code. Tool limits come from the `zod` schemas in `src/index.ts`.
- Do not add runtime dependencies without discussing it first.
- Do not write to stdout from the server: it carries the MCP protocol. Log to stderr.
- Diagrams in `docs/images/` are hand-written SVG, not Mermaid, so they render everywhere.

Issues labelled **good first issue** are a good place to start.

Maintained by Saurabh Pathak.
