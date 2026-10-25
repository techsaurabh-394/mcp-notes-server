# 20-second demo (record as a GIF)

Goal: show that Claude Desktop can save a note, find it again by keyword, and that the note lives in a plain file.

## Setup (once, not recorded)

1. Add the server to Claude Desktop (see the README quick start). To keep your real notes out of the recording, use a throwaway file:

   ```json
   {
     "mcpServers": {
       "notes": {
         "command": "npx",
         "args": ["-y", "mcp-notes-server"],
         "env": { "NOTES_FILE": "/tmp/demo-notes.json" }
       }
     }
   }
   ```
2. Fully quit and reopen Claude Desktop. Start a **new chat**. Make sure the hammer/tools icon shows `notes`.
3. Delete any old demo data: `rm -f /tmp/demo-notes.json`.
4. Screen recorder at about 1000 px wide, cursor visible. Terminal window ready next to Claude for the last shot (optional).

## Script

| Time | You type | What should happen |
|---|---|---|
| 0-2s | (show the empty chat) | Tools icon with `notes` visible |
| 2-8s | `Save a note titled "RAG chunking": use 800-character chunks with 100 characters of overlap. Tag it rag.` | Claude asks permission to use `add_note` (click Allow). Tool result: `Saved note <8 hex chars>: RAG chunking`. Claude confirms in its own words. |
| 8-14s | `Search my notes for chunking.` | Claude calls `search_notes`. Tool result: `[<id>] RAG chunking  #rag` followed by `Use 800-character chunks with 100 characters of overlap.` Claude summarises it. |
| 14-18s | `List my notes.` | Claude calls `list_notes`: `[<id>] RAG chunking  #rag` |
| 18-20s | (optional) in a terminal: `cat /tmp/demo-notes.json` | JSON with `id`, `title`, `content`, `tags`, `createdAt` |

Claude's wording will differ from run to run; only the tool results above are deterministic. The id differs every run.

## Check the tool output without Claude

```bash
npm run build
NOTES_FILE=$(mktemp -u) node scripts/demo-check.mjs
```

Real output from that script:

```
--- add_note
Saved note febfe9b9: RAG chunking
--- search_notes
[febfe9b9] RAG chunking  #rag
Use 800-character chunks with 100 characters of overlap.
--- list_notes
[febfe9b9] RAG chunking  #rag
```

(The id will be different on your machine.)

## Make the GIF

Record with any screen recorder (QuickTime, then convert), e.g. with ffmpeg and gifski:

```bash
ffmpeg -i demo.mov -vf "fps=12,scale=900:-1" frames/%04d.png
gifski --fps 12 --width 900 -o docs/demo.gif frames/*.png
```

Keep the GIF under about 5 MB so GitHub renders it quickly, then add `![Demo](docs/demo.gif)` to the README.
