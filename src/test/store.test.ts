import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { NoteStore } from "../store.js";

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
