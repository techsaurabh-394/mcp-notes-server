#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { NoteStore, ID_PATTERN, type Note } from "./store.js";

const store = new NoteStore();
const server = new McpServer({ name: "mcp-notes-server", version: "1.1.0" });

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

const checkId = (id: string) =>
  ID_PATTERN.test(id) ? undefined : `Invalid note id "${id}": ids are 8 hex characters (see list_notes).`;

server.registerTool(
  "get_note",
  {
    title: "Get note",
    description: "Fetch one note by id, with full content.",
    inputSchema: { id: z.string().min(1).describe("Note id from list_notes or search_notes") },
    annotations: { readOnlyHint: true },
  },
  async ({ id }) => {
    const bad = checkId(id);
    if (bad) return fail(bad);
    const note = await store.get(id);
    return note ? text(fmt(note)) : fail(`No note with id ${id}.`);
  }
);

server.registerTool(
  "update_note",
  {
    title: "Update note",
    description: "Edit an existing note. Provide the id and at least one of title, content or tags. Tags, if given, replace the existing tags.",
    inputSchema: {
      id: z.string().min(1).describe("Note id"),
      title: z.string().min(1).max(200).optional().describe("New title"),
      content: z.string().min(1).max(20000).optional().describe("New body"),
      tags: z.array(z.string()).max(10).optional().describe("New tags (replaces all existing tags)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },
  async ({ id, title, content, tags }) => {
    const bad = checkId(id);
    if (bad) return fail(bad);
    if (title === undefined && content === undefined && tags === undefined)
      return fail("Nothing to update: provide at least one of title, content or tags.");
    try {
      const note = await store.update(id, { title, content, tags });
      return note ? text(`Updated note ${note.id}: ${note.title}`) : fail(`No note with id ${id}.`);
    } catch (err) {
      return fail(`Could not update note: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
);

server.registerResource(
  "all-notes",
  "notes://all",
  { title: "All notes", description: "Every note, newest first, as one text document.", mimeType: "text/plain" },
  async (uri) => {
    const notes = await store.list();
    return {
      contents: [{ uri: uri.href, mimeType: "text/plain", text: notes.length ? notes.map(fmt).join("\n\n---\n\n") : "No notes yet." }],
    };
  }
);

server.registerResource(
  "note",
  new ResourceTemplate("notes://{id}", {
    list: async () => ({
      resources: (await store.list()).map((n) => ({ uri: `notes://${n.id}`, name: n.title, mimeType: "text/plain" })),
    }),
  }),
  { title: "Note", description: "A single note by id.", mimeType: "text/plain" },
  async (uri, { id }) => {
    const noteId = Array.isArray(id) ? id[0] : id;
    const bad = checkId(noteId);
    if (bad) throw new Error(bad);
    const note = await store.get(noteId);
    if (!note) throw new Error(`No note with id ${noteId}.`);
    return { contents: [{ uri: uri.href, mimeType: "text/plain", text: fmt(note) }] };
  }
);

server.registerPrompt(
  "review_notes",
  {
    title: "Review notes",
    description: "Ask the model to summarise and organise your notes, optionally only those with one tag.",
    argsSchema: { tag: z.string().optional().describe("Only review notes with this tag") },
  },
  async ({ tag }) => {
    const notes = await store.list(tag);
    const body = notes.length ? notes.map(fmt).join("\n\n---\n\n") : "(no notes found)";
    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Review the following notes${tag ? ` tagged "${tag}"` : ""}. Summarise the key points, flag duplicates or contradictions, and suggest better tags.\n\n${body}`,
          },
        },
      ],
    };
  }
);

async function main() {
  await server.connect(new StdioServerTransport());
  console.error("mcp-notes-server running on stdio"); // stderr only: stdout is the protocol channel
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
