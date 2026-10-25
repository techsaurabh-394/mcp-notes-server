// Prints the real tool output the demo in docs/DEMO.md relies on.
// Run: npm run build && NOTES_FILE=$(mktemp -u) node scripts/demo-check.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const t = new StdioClientTransport({ command: "node", args: ["dist/index.js"], env: { ...process.env, NOTES_FILE: process.env.NOTES_FILE ?? "/tmp/demo-notes.json" }, stderr: "ignore" });
const c = new Client({ name: "d", version: "0" }); await c.connect(t);
const show = async (n, a) => { const r = await c.callTool({ name: n, arguments: a }); console.log(`--- ${n}\n` + r.content.map(x => x.text).join("\n")); return r; };
await show("add_note", { title: "RAG chunking", content: "Use 800-character chunks with 100 characters of overlap.", tags: ["rag"] });
await show("search_notes", { query: "chunking" });
await show("list_notes", {});
await c.close();
