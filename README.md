# mcp-notes-server

[![Stars](https://img.shields.io/github/stars/techsaurabh-394/mcp-notes-server?style=flat&logo=github&color=6ea8fe)](https://github.com/techsaurabh-394/mcp-notes-server/stargazers) [![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat)](LICENSE) [![Last commit](https://img.shields.io/github/last-commit/techsaurabh-394/mcp-notes-server?style=flat)](https://github.com/techsaurabh-394/mcp-notes-server/commits/main) [![Issues](https://img.shields.io/github/issues/techsaurabh-394/mcp-notes-server?style=flat)](https://github.com/techsaurabh-394/mcp-notes-server/issues) [![Buy Me A Coffee](https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=flat&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/saurabhdev)

A small [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server in TypeScript that gives an AI assistant a persistent, searchable notes store. Built to show the full MCP loop: typed tools, input validation, safe writes, and client configuration.

<!-- Add a demo GIF here after recording one:  ![demo](docs/demo.gif) -->

## Tools

| Tool | What it does | Side effects |
|---|---|---|
| `add_note` | Save a note with title, content and optional tags | Writes |
| `list_notes` | List notes newest first, optionally by tag | Read-only |
| `search_notes` | Keyword search over titles, tags and bodies (title matches rank highest) | Read-only |
| `delete_note` | Permanently delete a note by id | Destructive |

Notes are stored in a JSON file (`~/.mcp-notes/notes.json` by default, override with `NOTES_FILE`). Writes are atomic (temp file + rename).

## Quick start

```bash
git clone https://github.com/techsaurabh-394/mcp-notes-server.git
cd mcp-notes-server
npm install
npm run build
npm test
```

## Use with Claude Desktop

Add this to your Claude Desktop config (`claude_desktop_config.json`), using the absolute path to your clone:

```json
{
  "mcpServers": {
    "notes": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-notes-server/dist/index.js"],
      "env": { "NOTES_FILE": "/absolute/path/to/notes.json" }
    }
  }
}
```

Restart Claude Desktop, then try:

- "Save a note titled *RAG chunking* with the content *use 800-char chunks with overlap*, tag it rag."
- "Search my notes for chunking."
- "List my notes tagged rag."

Other MCP clients (Claude Code, Cursor, etc.) work the same way: point them at `node dist/index.js` over stdio.

## Design notes

- **stdout is the protocol channel.** All logging goes to stderr.
- **Validation:** every tool input is checked with `zod`; bad ids return an error result instead of throwing.
- **Tool hints:** read-only and destructive tools are annotated so clients can show the right confirmation UI.
- **No shell, no SQL, no network:** the server only reads and writes one JSON file.

## Project layout

```
src/index.ts        MCP server and tool definitions
src/store.ts        NoteStore: JSON-file persistence and search
src/test/           node:test unit tests
```

## License

MIT, built by Saurabh Pathak.

## Roadmap (contributions welcome)
- [ ] `update_note` tool (edit title, content, tags)
- [ ] Optional SQLite backend for large note collections
- [ ] Semantic search using embeddings
- [ ] Publish to npm so it runs with `npx mcp-notes-server`
- [ ] Streamable HTTP transport for remote clients

If this is useful, a star helps others find it.

## Support this project
If this is useful, a star helps others find it, and you can support more free open-source work:

<a href="https://buymeacoffee.com/saurabhdev"><img src="https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy me a coffee"/></a>

---

<p align="center">
  <b>Saurabh Pathak</b> · AI Engineer &amp; Full-Stack Developer<br/>
  <a href="https://github.com/techsaurabh-394">GitHub</a> ·
  <a href="https://www.linkedin.com/in/tech-saurabh/">LinkedIn</a> ·
  <a href="https://mernstackdev.com">Blog</a> ·
  <a href="mailto:saurabhpathak394@gmail.com">saurabhpathak394@gmail.com</a>
</p>
