import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { NoteStore, ID_PATTERN } from "../store.js";

async function tmpStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "notes-"));
  return new NoteStore(path.join(dir, "notes.json"));
}

test("add, list and get", async () => {
  const s = await tmpStore();
  const n = await s.add("Docker tips", "Use multi-stage builds", ["Docker", "devops"]);
  assert.deepEqual(n.tags, ["docker", "devops"]);
  assert.equal((await s.list()).length, 1);
  assert.equal((await s.get(n.id))?.title, "Docker tips");
});

test("tag filter", async () => {
  const s = await tmpStore();
  await s.add("A", "x", ["one"]);
  await s.add("B", "y", ["two"]);
  assert.equal((await s.list("two")).length, 1);
});

test("search ranks title matches first", async () => {
  const s = await tmpStore();
  await s.add("Grocery", "buy redis later", []);
  await s.add("Redis caching", "notes about ttl", []);
  const hits = await s.search("redis");
  assert.equal(hits[0].title, "Redis caching");
  assert.equal(hits.length, 2);
});

test("delete", async () => {
  const s = await tmpStore();
  const n = await s.add("Temp", "x");
  assert.equal(await s.remove(n.id), true);
  assert.equal(await s.remove(n.id), false);
});

test("update changes only provided fields and normalizes tags", async () => {
  const s = await tmpStore();
  const n = await s.add("Old", "body", ["a"]);
  const u = await s.update(n.id, { title: "  New  ", tags: ["X", "x", " y "] });
  assert.equal(u?.title, "New");
  assert.equal(u?.content, "body");
  assert.deepEqual(u?.tags, ["x", "y"]);
  assert.equal(u?.createdAt, n.createdAt);
  assert.equal((await s.get(n.id))?.title, "New"); // persisted
});

test("update clears tags with empty array", async () => {
  const s = await tmpStore();
  const n = await s.add("T", "b", ["a"]);
  assert.deepEqual((await s.update(n.id, { tags: [] }))?.tags, []);
});

test("update unknown id returns undefined", async () => {
  const s = await tmpStore();
  assert.equal(await s.update("deadbeef", { title: "x" }), undefined);
});

test("update rejects blank title/content and leaves note unchanged", async () => {
  const s = await tmpStore();
  const n = await s.add("Keep", "body");
  await assert.rejects(s.update(n.id, { title: "   " }), /title/);
  await assert.rejects(s.update(n.id, { content: "" }), /content/);
  assert.equal((await s.get(n.id))?.title, "Keep");
});

test("get/list/search on an empty store (missing file)", async () => {
  const s = await tmpStore();
  assert.equal(await s.get("deadbeef"), undefined);
  assert.deepEqual(await s.list(), []);
  assert.deepEqual(await s.search("anything"), []);
});

test("search edge cases: blank query, limit, case-insensitivity", async () => {
  const s = await tmpStore();
  await s.add("Alpha", "one", ["t"]);
  await s.add("Alpha two", "two", ["t"]);
  assert.deepEqual(await s.search("   "), []);
  assert.equal((await s.search("ALPHA", 1)).length, 1);
  assert.equal((await s.search("t")).length, 2);
});

test("valid JSON that is not an array is treated as empty", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "notes-"));
  const file = path.join(dir, "notes.json");
  await fs.writeFile(file, "{}");
  assert.deepEqual(await new NoteStore(file).list(), []);
});

test("ID_PATTERN accepts generated ids only", async () => {
  const s = await tmpStore();
  const n = await s.add("T", "b");
  assert.ok(ID_PATTERN.test(n.id));
  assert.ok(!ID_PATTERN.test("../etc/passwd"));
});

test("list returns newest first", async () => {
  const s = await tmpStore();
  await s.add("first", "a");
  await new Promise((r) => setTimeout(r, 5));
  await s.add("second", "b");
  assert.deepEqual((await s.list()).map((n) => n.title), ["second", "first"]);
});

test("search scores: tag match outranks body-only match", async () => {
  const s = await tmpStore();
  await s.add("Alpha", "mentions deploy in body", []);
  await s.add("Beta", "unrelated", ["deploy"]);
  const hits = await s.search("deploy");
  assert.deepEqual(hits.map((n) => n.title), ["Beta", "Alpha"]);
});

test("notes persist across store instances and no temp file is left behind", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "notes-"));
  const file = path.join(dir, "nested", "notes.json"); // folder is created on first write
  const n = await new NoteStore(file).add("Kept", "body");
  assert.equal((await new NoteStore(file).get(n.id))?.title, "Kept");
  assert.deepEqual(await fs.readdir(path.dirname(file)), ["notes.json"]);
});

test("invalid JSON in the notes file raises instead of silently dropping notes", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "notes-"));
  const file = path.join(dir, "notes.json");
  await fs.writeFile(file, "{not json");
  await assert.rejects(new NoteStore(file).list());
});

// ---- limits, validation, locking, export ----
import { LIMITS, ValidationError } from "../store.js";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

test("add rejects empty, oversized and control-character input", async () => {
  const s = await tmpStore();
  await assert.rejects(s.add("  ", "x"), ValidationError);
  await assert.rejects(s.add("ok", "   "), ValidationError);
  await assert.rejects(s.add("t".repeat(LIMITS.title + 1), "x"), /title too long/);
  await assert.rejects(s.add("two\nlines", "x"), /control characters/);
  await assert.rejects(s.add("ok", "x".repeat(LIMITS.content + 1)), /content too long/);
  await assert.rejects(s.add("ok", "a\u0000b"), /NUL/);
  await assert.rejects(s.add("ok", "x", Array.from({ length: LIMITS.tags + 1 }, (_, i) => `t${i}`)), /Too many tags/);
  await assert.rejects(s.add("ok", "x", ["z".repeat(LIMITS.tagLength + 1)]), /Tag too long/);
  assert.equal((await s.list()).length, 0, "nothing was stored");
  // boundaries are accepted
  await s.add("t".repeat(LIMITS.title), "x".repeat(LIMITS.content));
  assert.equal((await s.list()).length, 1);
});

test("update validates the same limits and leaves the note unchanged", async () => {
  const s = await tmpStore();
  const n = await s.add("Keep", "me");
  await assert.rejects(s.update(n.id, { title: "x".repeat(LIMITS.title + 1) }), ValidationError);
  await assert.rejects(s.update(n.id, { tags: ["a".repeat(LIMITS.tagLength + 1)] }), ValidationError);
  const after = await s.get(n.id);
  assert.equal(after?.title, "Keep");
});

test("max notes limit is enforced", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "notes-max-"));
  const file = path.join(dir, "notes.json");
  const seed = Array.from({ length: LIMITS.notes }, (_, i) => ({
    id: i.toString(16).padStart(8, "0"),
    title: `n${i}`,
    content: "c",
    tags: [],
    createdAt: new Date(i).toISOString(),
  }));
  await fs.writeFile(file, JSON.stringify(seed));
  const s = new NoteStore(file);
  await assert.rejects(s.add("one more", "x"), /Note limit reached/);
  assert.ok(await s.remove("00000000"));
  await s.add("fits now", "x");
});

test("a notes file with malformed entries is refused, not overwritten", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "notes-bad-"));
  const file = path.join(dir, "notes.json");
  const raw = JSON.stringify([{ id: 1, title: null }]);
  await fs.writeFile(file, raw);
  const s = new NoteStore(file);
  await assert.rejects(s.add("a", "b"), /unexpected shape/);
  assert.equal(await fs.readFile(file, "utf8"), raw);
});

test("concurrent adds from one process lose nothing", async () => {
  const s = await tmpStore();
  await Promise.all(Array.from({ length: 25 }, (_, i) => s.add(`n${i}`, "c")));
  assert.equal((await s.list()).length, 25);
});

test("two separate OS processes writing at once lose no notes (lock file)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "notes-lock-"));
  const file = path.join(dir, "notes.json");
  const storeJs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "store.js");
  const script = `
    import { NoteStore } from ${JSON.stringify("file://" + storeJs)};
    const s = new NoteStore(${JSON.stringify(file)});
    const tag = process.argv[1];
    for (let i = 0; i < 15; i++) await s.add(tag + "-" + i, "body");
  `;
  const run = (tag: string) =>
    new Promise<void>((resolve, reject) => {
      const p = spawn(process.execPath, ["--input-type=module", "-e", script, tag], { stdio: "inherit" });
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker ${tag} exited ${code}`))));
    });
  await Promise.all(["a", "b", "c", "d"].map(run));
  const s = new NoteStore(file);
  const notes = await s.list();
  assert.equal(notes.length, 60, "4 processes x 15 adds must all survive");
  assert.equal(new Set(notes.map((n) => n.id)).size, 60, "ids are unique");
  const leftovers = (await fs.readdir(dir)).filter((f) => f !== "notes.json");
  assert.deepEqual(leftovers, [], "no lock or temp files left behind");
});

test("a stale lock file left by a crashed process is cleaned up", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "notes-stale-"));
  const file = path.join(dir, "notes.json");
  const lock = `${file}.lock`;
  await fs.writeFile(lock, "99999");
  const old = new Date(Date.now() - 120_000);
  await fs.utimes(lock, old, old);
  const s = new NoteStore(file);
  await s.add("after crash", "works");
  assert.equal((await s.list()).length, 1);
});

test("exportMarkdown: header, per-note sections, tag filter and empty case", async () => {
  const s = await tmpStore();
  assert.deepEqual(await s.exportMarkdown(), { markdown: "# Notes export\n\n0 notes.\n", count: 0 });
  const a = await s.add("Alpha", "first body", ["x"]);
  await s.add("Beta", "second body", ["y"]);
  const all = await s.exportMarkdown();
  assert.equal(all.count, 2);
  assert.match(all.markdown, /^# Notes export\n\n2 notes\./);
  assert.match(all.markdown, /## Alpha/);
  assert.match(all.markdown, new RegExp(`id: \`${a.id}\``));
  const only = await s.exportMarkdown("X");
  assert.equal(only.count, 1);
  assert.match(only.markdown, /\(tag: x\)/);
  assert.doesNotMatch(only.markdown, /Beta/);
});
