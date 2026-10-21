#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { NoteStore, type Note } from "./store.js";

const store = new NoteStore();
const server = new McpServer({ name: "mcp-notes-server", version: "1.0.0" });

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true });

const fmt = (n: Note) =>
  `[${n.id}] ${n.title}${n.tags.length ? `  #${n.tags.join(" #")}` : ""}\n${n.content}`;

server.registerTool(
  "add_note",
  {
    title: "Add note",
    description: "Save a new note. Returns the note id. Use tags to group related notes.",
    inputSchema: {
      title: z.string().min(1).max(200).describe("Short title"),
      content: z.string().min(1).max(20000).describe("Body of the note"),
      tags: z.array(z.string()).max(10).optional().describe("Optional tags"),
    },
  },
  async ({ title, content, tags }) => {
    const note = await store.add(title, content, tags ?? []);
    return text(`Saved note ${note.id}: ${note.title}`);
  }
);

server.registerTool(
  "list_notes",
  {
    title: "List notes",
    description: "List notes, newest first. Optionally filter by a single tag.",
    inputSchema: { tag: z.string().optional().describe("Only notes with this tag") },
    annotations: { readOnlyHint: true },
  },
  async ({ tag }) => {
    const notes = await store.list(tag);
    if (notes.length === 0) return text("No notes found.");
    return text(notes.map((n) => `[${n.id}] ${n.title}${n.tags.length ? `  #${n.tags.join(" #")}` : ""}`).join("\n"));
  }
);

server.registerTool(
  "search_notes",
  {
    title: "Search notes",
    description: "Keyword search across note titles, tags and bodies. Returns the best matches with full content.",
    inputSchema: {
      query: z.string().min(1).describe("Space-separated keywords"),
      limit: z.number().int().min(1).max(20).optional().describe("Max results (default 5)"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ query, limit }) => {
    const hits = await store.search(query, limit ?? 5);
    if (hits.length === 0) return text(`No notes match "${query}".`);
    return text(hits.map(fmt).join("\n\n---\n\n"));
  }
);

server.registerTool(
  "delete_note",
  {
    title: "Delete note",
    description: "Permanently delete one note by id. This cannot be undone.",
    inputSchema: { id: z.string().min(1).describe("Note id from list_notes or search_notes") },
    annotations: { destructiveHint: true },
  },
  async ({ id }) => ((await store.remove(id)) ? text(`Deleted note ${id}.`) : fail(`No note with id ${id}.`))
);

async function main() {
  await server.connect(new StdioServerTransport());
  console.error("mcp-notes-server running on stdio"); // stderr only: stdout is the protocol channel
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
