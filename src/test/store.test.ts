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
