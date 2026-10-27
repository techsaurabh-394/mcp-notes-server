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

async function withServer(fn: (client: Client, file: string) => Promise<void>, extraEnv: Record<string, string> = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "notes-e2e-"));
  const file = path.join(dir, "notes.json");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverJs],
    env: { ...process.env, NOTES_FILE: file, ...extraEnv } as Record<string, string>,
    stderr: "ignore",
  });
  const client = new Client({ name: "e2e-test", version: "0.0.0" });
  await client.connect(transport);
  try {
    await fn(client, file);
  } finally {
    await client.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const call = (c: Client, name: string, args: Record<string, unknown> = {}): Promise<any> =>
  c.callTool({ name, arguments: args });

/** A bad call must never succeed. The SDK reports schema errors either as isError results or as protocol errors. */
async function mustFail(c: Client, name: string, args: Record<string, unknown>, pattern?: RegExp) {
  try {
    const r = await call(c, name, args);
    assert.equal(r.isError, true, `${name}(${JSON.stringify(args).slice(0, 60)}) should be an error`);
    if (pattern) assert.match(textOf(r), pattern);
  } catch (err) {
    if (err instanceof assert.AssertionError) throw err;
    if (pattern) assert.match(String((err as Error).message), pattern);
  }
}

test("server info, tool list and annotations", async () => {
  await withServer(async (client) => {
    const pkg = JSON.parse(await fs.readFile(path.resolve(path.dirname(serverJs), "..", "package.json"), "utf8"));
    assert.equal(client.getServerVersion()?.name, "mcp-notes-server");
    assert.equal(client.getServerVersion()?.version, pkg.version);
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      ["add_note", "delete_note", "export_notes", "get_note", "list_notes", "list_tags", "search_notes", "update_note"]
    );
    const ann = (n: string) => tools.find((t) => t.name === n)?.annotations;
    assert.equal(ann("delete_note")?.destructiveHint, true);
    for (const n of ["get_note", "list_notes", "search_notes", "export_notes", "list_tags"]) {
      assert.equal(ann(n)?.readOnlyHint, true, `${n} is read-only`);
    }
    assert.equal(ann("add_note")?.readOnlyHint, false);
    assert.equal(ann("update_note")?.destructiveHint, false);
  });
});

test("empty store: list, search, export, get and delete", async () => {
  await withServer(async (client) => {
    assert.match(textOf(await call(client, "list_notes")), /No notes found/);
    assert.match(textOf(await call(client, "search_notes", { query: "anything" })), /No notes match "anything"/);
    assert.match(textOf(await call(client, "export_notes")), /No notes to export/);
    assert.match(textOf(await call(client, "list_tags")), /No tags yet/);
    const get = await call(client, "get_note", { id: "deadbeef" });
    assert.equal(get.isError, true);
    assert.match(textOf(get), /No note with id deadbeef/);
    assert.equal((await call(client, "delete_note", { id: "deadbeef" })).isError, true);
  });
});

test("save a note, search it, read it, update it, export it, delete it", async () => {
  await withServer(async (client, file) => {
    const added = await call(client, "add_note", { title: "RAG chunking", content: "use 800-char chunks", tags: ["RAG"] });
    assert.ok(!added.isError);
    const id = /Saved note (\w+):/.exec(textOf(added))?.[1];
    assert.ok(id, "add_note returns an id");
    assert.equal(JSON.parse(await fs.readFile(file, "utf8")).length, 1, "note is on disk");

    assert.match(textOf(await call(client, "search_notes", { query: "chunking" })), /RAG chunking/);
    assert.match(textOf(await call(client, "search_notes", { query: "zzzzqqq" })), /No notes match/);
    assert.match(textOf(await call(client, "list_notes", { tag: "rag" })), new RegExp(id));
    assert.match(textOf(await call(client, "list_notes", { tag: "other" })), /No notes found/);

    const upd = await call(client, "update_note", { id, content: "use 500-char chunks", tags: ["rag", "search"] });
    assert.ok(!upd.isError);
    const got = textOf(await call(client, "get_note", { id }));
    assert.match(got, /500-char/);
    assert.match(got, /#rag #search/);

    assert.match(textOf(await call(client, "list_tags")), /rag \(1\)\nsearch \(1\)/);
    const exp = textOf(await call(client, "export_notes"));
    assert.match(exp, /^# Notes export/);
    assert.match(exp, /## RAG chunking/);
    assert.match(exp, /500-char/);
    assert.match(textOf(await call(client, "export_notes", { tag: "nope" })), /No notes to export/);

    assert.ok(!(await call(client, "delete_note", { id })).isError);
    assert.equal((await call(client, "delete_note", { id })).isError, true, "second delete fails");
    assert.match(textOf(await call(client, "list_notes")), /No notes found/);
  });
});

test("invalid input is rejected and nothing is stored", async () => {
  await withServer(async (client, file) => {
    await mustFail(client, "add_note", { title: "", content: "x" });
    await mustFail(client, "add_note", { title: "ok" });
    await mustFail(client, "add_note", { title: "t".repeat(201), content: "x" });
    await mustFail(client, "add_note", { title: "ok", content: "x".repeat(20_001) });
    await mustFail(client, "add_note", { title: "ok", content: "x", tags: Array.from({ length: 11 }, (_, i) => `t${i}`) });
    await mustFail(client, "add_note", { title: "ok", content: "x", tags: ["z".repeat(51)] });
    await mustFail(client, "add_note", { title: "line\nbreak", content: "x" }, /control characters/);
    await mustFail(client, "add_note", { title: "ok", content: "   " }, /empty/);
    await mustFail(client, "add_note", { title: 42, content: "x" });
    await mustFail(client, "search_notes", { query: "" });
    await mustFail(client, "search_notes", { query: "x", limit: 0 });
    await mustFail(client, "search_notes", { query: "x", limit: 21 });
    await mustFail(client, "get_note", { id: "../../etc/passwd" }, /Invalid note id/);
    await mustFail(client, "get_note", {});
    await mustFail(client, "update_note", { id: "nope", title: "x" }, /Invalid note id/);
    await mustFail(client, "update_note", { id: "deadbeef", title: "x" }, /No note with id/);
    await mustFail(client, "update_note", { id: "deadbeef" }, /Nothing to update/);
    await mustFail(client, "nonexistent_tool", {});
    await assert.rejects(fs.readFile(file, "utf8"), { code: "ENOENT" }, "store file was never created");
  });
});

test("update_note rejects bad values and keeps the old note", async () => {
  await withServer(async (client) => {
    const id = /Saved note (\w+):/.exec(textOf(await call(client, "add_note", { title: "Keep", content: "me" })))![1];
    await mustFail(client, "update_note", { id, title: "t".repeat(201) });
    await mustFail(client, "update_note", { id, title: "a\nb" }, /control characters/);
    assert.match(textOf(await call(client, "get_note", { id })), /Keep/);
  });
});

test("resources and prompt", async () => {
  await withServer(async (client) => {
    const id = /Saved note (\w+):/.exec(
      textOf(await call(client, "add_note", { title: "RAG chunking", content: "use 500-char chunks", tags: ["rag"] }))
    )![1];
    const { resources } = await client.listResources();
    assert.ok(resources.some((r) => r.uri === "notes://all"));
    assert.ok(resources.some((r) => r.uri === `notes://${id}`));
    const { resourceTemplates } = await client.listResourceTemplates();
    assert.equal(resourceTemplates[0].uriTemplate, "notes://{id}");
    assert.match(String(((await client.readResource({ uri: `notes://${id}` })).contents[0] as any).text), /500-char/);
    assert.match(String(((await client.readResource({ uri: "notes://all" })).contents[0] as any).text), /RAG chunking/);
    await assert.rejects(client.readResource({ uri: "notes://deadbeef" }));
    await assert.rejects(client.readResource({ uri: "notes://..%2f..%2fetc" }));
    const { prompts } = await client.listPrompts();
    assert.deepEqual(prompts.map((p) => p.name), ["review_notes"]);
    const prompt = await client.getPrompt({ name: "review_notes", arguments: { tag: "rag" } });
    assert.match((prompt.messages[0].content as any).text, /RAG chunking/);
  });
});

test("stdout carries only protocol frames (logs go to stderr)", async () => {
  const { spawn } = await import("node:child_process");
  const p = spawn(process.execPath, [serverJs], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, NOTES_FILE: path.join(os.tmpdir(), `x-${process.pid}.json`) } });
  let out = "";
  let err = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (err += d));
  p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } } }) + "\n");
  await new Promise((r) => setTimeout(r, 800));
  p.kill();
  const lines = out.split("\n").filter(Boolean);
  assert.ok(lines.length >= 1);
  for (const l of lines) assert.equal(JSON.parse(l).jsonrpc, "2.0", "every stdout line is a JSON-RPC message");
  assert.match(err, /running on stdio/);
});

test("NOTES_CONFIRM_DELETE=1: delete needs approval (token flow), nothing is deleted before it", async () => {
  await withServer(
    async (client, file) => {
      const id = /Saved note (\w+):/.exec(textOf(await call(client, "add_note", { title: "Precious", content: "do not lose" })))![1];
      const tools = (await client.listTools()).tools;
      const del = tools.find((t) => t.name === "delete_note")!;
      assert.equal(del.annotations?.destructiveHint, true);
      assert.match(del.description ?? "", /user must approve/i);

      const first = await call(client, "delete_note", { id });
      const msg = textOf(first);
      assert.match(msg, /Precious/, "preview names the note");
      const token = /confirm_token[^A-Za-z0-9]*["'`]?([A-Za-z0-9_-]{8,})/.exec(msg)?.[1];
      assert.ok(token, `a one-time token is offered: ${msg}`);
      assert.equal(JSON.parse(await fs.readFile(file, "utf8")).length, 1, "still stored after preview");

      const wrong = await call(client, "delete_note", { id, confirm_token: "not-a-real-token" });
      assert.equal(wrong.isError, true);
      assert.equal(JSON.parse(await fs.readFile(file, "utf8")).length, 1, "bad token deletes nothing");

      const done = await call(client, "delete_note", { id, confirm_token: token });
      assert.ok(!done.isError, textOf(done));
      assert.equal(JSON.parse(await fs.readFile(file, "utf8")).length, 0, "deleted after approval");

      const unknown = await call(client, "delete_note", { id: "deadbeef" });
      assert.equal(unknown.isError, true);
      assert.match(textOf(unknown), /No note with id/);
    },
    { NOTES_CONFIRM_DELETE: "1", NOTES_CONFIRM_MODE: "token" }
  );
});
