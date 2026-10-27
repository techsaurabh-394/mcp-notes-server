import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: string;
}

export interface NotePatch {
  title?: string;
  content?: string;
  tags?: string[];
}

export const ID_PATTERN = /^[a-f0-9]{8}$/;

/** Hard limits enforced by the store itself (the zod schemas in index.ts mirror them). */
export const LIMITS = {
  title: 200,
  content: 20_000,
  tags: 10,
  tagLength: 50,
  notes: 5_000,
} as const;

/** Raised for input the store refuses to save. Messages are safe to show to the model. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function normalizeTags(tags: string[]): string[] {
  const out = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (out.length > LIMITS.tags) throw new ValidationError(`Too many tags: at most ${LIMITS.tags} allowed.`);
  const long = out.find((t) => t.length > LIMITS.tagLength);
  if (long) throw new ValidationError(`Tag too long: at most ${LIMITS.tagLength} characters per tag.`);
  return out;
}

function checkTitle(title: string): string {
  const t = title.trim();
  if (!t) throw new ValidationError("title cannot be empty");
  if (t.length > LIMITS.title) throw new ValidationError(`title too long: at most ${LIMITS.title} characters.`);
  if (/[\u0000-\u001f\u007f]/.test(t)) throw new ValidationError("title cannot contain control characters or line breaks.");
  return t;
}

function checkContent(content: string): string {
  if (!content.trim()) throw new ValidationError("content cannot be empty");
  if (content.length > LIMITS.content) throw new ValidationError(`content too long: at most ${LIMITS.content} characters.`);
  if (content.includes("\u0000")) throw new ValidationError("content cannot contain NUL characters.");
  return content;
}

function isNote(x: unknown): x is Note {
  const n = x as Note;
  return (
    !!n &&
    typeof n === "object" &&
    typeof n.id === "string" &&
    typeof n.title === "string" &&
    typeof n.content === "string" &&
    typeof n.createdAt === "string" &&
    Array.isArray(n.tags) &&
    n.tags.every((t) => typeof t === "string")
  );
}

const LOCK_RETRY_MS = 25;
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_STALE_MS = 30_000;

export class NoteStore {
  constructor(private readonly file: string = defaultFile()) {}

  private async load(): Promise<Note[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.file, "utf8");
    } catch (err: any) {
      if (err?.code === "ENOENT") return [];
      throw err;
    }
    const data = JSON.parse(raw); // invalid JSON throws: never silently drop notes
    if (!Array.isArray(data)) return [];
    if (!data.every(isNote)) {
      throw new Error(`Notes file ${this.file} contains entries with an unexpected shape; refusing to continue so nothing is overwritten.`);
    }
    return data;
  }

  private async save(notes: Note[]): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
    try {
      await fs.writeFile(tmp, JSON.stringify(notes, null, 2), "utf8");
      await fs.rename(tmp, this.file); // atomic replace
    } catch (err) {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }

  /**
   * Run a read-modify-write cycle while holding an exclusive lock file (`<file>.lock`),
   * so two server processes cannot overwrite each other's changes.
   * A lock older than 30 s is treated as left behind by a crashed process and removed.
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const lock = `${this.file}.lock`;
    const started = Date.now();
    for (;;) {
      try {
        const fh = await fs.open(lock, "wx"); // fails if it already exists
        await fh.writeFile(String(process.pid));
        await fh.close();
        break;
      } catch (err: any) {
        if (err?.code !== "EEXIST") throw err;
        try {
          const st = await fs.stat(lock);
          if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
            await fs.rm(lock, { force: true });
            continue;
          }
        } catch {
          continue; // lock vanished between open and stat: retry now
        }
        if (Date.now() - started > LOCK_TIMEOUT_MS) {
          throw new Error(`Timed out waiting for the notes file lock (${lock}). Another process may be stuck.`);
        }
        await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
      }
    }
    try {
      return await fn();
    } finally {
      await fs.rm(lock, { force: true });
    }
  }

  async add(title: string, content: string, tags: string[] = []): Promise<Note> {
    const t = checkTitle(title);
    const c = checkContent(content);
    const tg = normalizeTags(tags);
    return this.withLock(async () => {
      const notes = await this.load();
      if (notes.length >= LIMITS.notes) {
        throw new ValidationError(`Note limit reached: at most ${LIMITS.notes} notes. Delete some before adding more.`);
      }
      let id = randomUUID().slice(0, 8);
      while (notes.some((n) => n.id === id)) id = randomUUID().slice(0, 8);
      const note: Note = { id, title: t, content: c, tags: tg, createdAt: new Date().toISOString() };
      notes.push(note);
      await this.save(notes);
      return note;
    });
  }

  async list(tag?: string): Promise<Note[]> {
    const notes = await this.load();
    const t = tag?.trim().toLowerCase();
    const filtered = t ? notes.filter((n) => n.tags.includes(t)) : notes;
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(id: string): Promise<Note | undefined> {
    return (await this.load()).find((n) => n.id === id);
  }

  async search(query: string, limit = 5): Promise<Note[]> {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    const scored = (await this.load())
      .map((n) => {
        const title = n.title.toLowerCase();
        const body = n.content.toLowerCase();
        let score = 0;
        for (const term of terms) {
          if (title.includes(term)) score += 3;
          if (n.tags.includes(term)) score += 2;
          if (body.includes(term)) score += 1;
        }
        return { n, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((x) => x.n);
  }

  async remove(id: string): Promise<boolean> {
    return this.withLock(async () => {
      const notes = await this.load();
      const next = notes.filter((n) => n.id !== id);
      if (next.length === notes.length) return false;
      await this.save(next);
      return true;
    });
  }

  /** Edit title/content/tags. Returns the updated note, or undefined if the id does not exist. */
  async update(id: string, patch: NotePatch): Promise<Note | undefined> {
    const title = patch.title !== undefined ? checkTitle(patch.title) : undefined;
    const content = patch.content !== undefined ? checkContent(patch.content) : undefined;
    const tags = patch.tags !== undefined ? normalizeTags(patch.tags) : undefined;
    return this.withLock(async () => {
      const notes = await this.load();
      const note = notes.find((n) => n.id === id);
      if (!note) return undefined;
      if (title !== undefined) note.title = title;
      if (content !== undefined) note.content = content;
      if (tags !== undefined) note.tags = tags;
      await this.save(notes);
      return note;
    });
  }

  /** Every tag in use with its note count, most used first (ties alphabetical). */
  async listTags(): Promise<{ tag: string; count: number }[]> {
    const counts = new Map<string, number>();
    for (const n of await this.load()) for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].map(([tag, count]) => ({ tag, count })).sort((x, y) => y.count - x.count || x.tag.localeCompare(y.tag));
  }

  /** All notes (optionally one tag) as a single Markdown document, newest first. */
  async exportMarkdown(tag?: string): Promise<{ markdown: string; count: number }> {
    const notes = await this.list(tag);
    const head = `# Notes export${tag ? ` (tag: ${tag.trim().toLowerCase()})` : ""}\n\n${notes.length} note${notes.length === 1 ? "" : "s"}.\n`;
    const body = notes
      .map(
        (n) =>
          `\n---\n\n## ${n.title}\n\n- id: \`${n.id}\`\n- created: ${n.createdAt}\n- tags: ${n.tags.length ? n.tags.map((t) => `\`${t}\``).join(", ") : "none"}\n\n${n.content}\n`
      )
      .join("");
    return { markdown: head + body, count: notes.length };
  }
}

function defaultFile(): string {
  return process.env.NOTES_FILE ?? path.join(os.homedir(), ".mcp-notes", "notes.json");
}
