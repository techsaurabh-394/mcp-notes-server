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

export class NoteStore {
  constructor(private readonly file: string = defaultFile()) {}

  private async load(): Promise<Note[]> {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const data = JSON.parse(raw);
      return Array.isArray(data) ? (data as Note[]) : [];
    } catch (err: any) {
      if (err?.code === "ENOENT") return [];
      throw err;
    }
  }

  private async save(notes: Note[]): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(notes, null, 2), "utf8");
    await fs.rename(tmp, this.file); // atomic replace
  }

  async add(title: string, content: string, tags: string[] = []): Promise<Note> {
    const notes = await this.load();
    const note: Note = {
      id: randomUUID().slice(0, 8),
      title: title.trim(),
      content,
      tags: [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))],
      createdAt: new Date().toISOString(),
    };
    notes.push(note);
    await this.save(notes);
    return note;
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
    const notes = await this.load();
    const next = notes.filter((n) => n.id !== id);
    if (next.length === notes.length) return false;
    await this.save(next);
    return true;
  }
}

function defaultFile(): string {
  return process.env.NOTES_FILE ?? path.join(os.homedir(), ".mcp-notes", "notes.json");
}
