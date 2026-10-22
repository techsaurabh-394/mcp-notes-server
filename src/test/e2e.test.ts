import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverJs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "index.js");

const textOf = (r: any): string => r.content.map((c: any) => c.text).join("\n");

test("end-to-end over stdio", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "notes-e2e-"));
  const file = path.join(dir, "notes.json");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverJs],
    env: { ...process.env, NOTES_FILE: file } as Record<string, string>,
    stderr: "ignore",
  });
  const client = new Client({ name: "e2e-test", version: "0.0.0" });
  await client.connect(transport); // performs initialize
  try {
    assert.equal(client.getServerVersion()?.name, "mcp-notes-server");

    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      ["add_note", "delete_note", "get_note", "list_notes", "search_notes", "update_note"]
    );
    assert.equal(tools.find((t) => t.name === "delete_note")?.annotations?.destructiveHint, true);
    assert.equal(tools.find((t) => t.name === "get_note")?.annotations?.readOnlyHint, true);

    const added: any = await client.callTool({
      name: "add_note",
      arguments: { title: "RAG chunking", content: "use 800-char chunks", tags: ["RAG"] },
    });
    const id = /Saved note (\w+):/.exec(textOf(added))?.[1];
    assert.ok(id, "add_note should return an id");

    const found: any = await client.callTool({ name: "search_notes", arguments: { query: "chunking" } });
    assert.match(textOf(found), /RAG chunking/);

    const upd: any = await client.callTool({
      name: "update_note",
      arguments: { id, content: "use 500-char chunks", tags: ["rag", "search"] },
    });
    assert.ok(!upd.isError);
    const got: any = await client.callTool({ name: "get_note", arguments: { id } });
    assert.match(textOf(got), /500-char/);
    assert.match(textOf(got), /#rag #search/);

    const badId: any = await client.callTool({ name: "update_note", arguments: { id: "nope", title: "x" } });
    assert.equal(badId.isError, true);
    const missing: any = await client.callTool({ name: "update_note", arguments: { id: "deadbeef", title: "x" } });
    assert.equal(missing.isError, true);
    assert.match(textOf(missing), /No note with id/);
    const empty: any = await client.callTool({ name: "update_note", arguments: { id } });
    assert.equal(empty.isError, true);

    const { resources } = await client.listResources();
    assert.ok(resources.some((r) => r.uri === "notes://all"));
    assert.ok(resources.some((r) => r.uri === `notes://${id}`));
    const { resourceTemplates } = await client.listResourceTemplates();
    assert.equal(resourceTemplates[0].uriTemplate, "notes://{id}");
    const one = await client.readResource({ uri: `notes://${id}` });
    assert.match(String((one.contents[0] as any).text), /500-char/);
    const all = await client.readResource({ uri: "notes://all" });
    assert.match(String((all.contents[0] as any).text), /RAG chunking/);
    await assert.rejects(client.readResource({ uri: "notes://deadbeef" }));

    const { prompts } = await client.listPrompts();
    assert.deepEqual(prompts.map((p) => p.name), ["review_notes"]);
    const prompt = await client.getPrompt({ name: "review_notes", arguments: { tag: "rag" } });
    assert.equal(prompt.messages[0].role, "user");
    assert.match((prompt.messages[0].content as any).text, /RAG chunking/);

    const del: any = await client.callTool({ name: "delete_note", arguments: { id } });
    assert.ok(!del.isError);
    const again: any = await client.callTool({ name: "delete_note", arguments: { id } });
    assert.equal(again.isError, true);
    const none: any = await client.callTool({ name: "list_notes", arguments: {} });
    assert.match(textOf(none), /No notes found/);
  } finally {
    await client.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
