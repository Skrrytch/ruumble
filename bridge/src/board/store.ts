/**
 * Speicher der Pinnwand (ADR-0011): SQLite für Beiträge, Anhänge als Dateien nach SHA-256.
 * Aufbewahrung, Kontingent und gelöschte Kanäle räumt `cleanup()` auf (stündlich aus main.ts).
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import type { PostKind } from "@ruumble/protocol";

export interface StoredAttachment {
  id: string;
  mime: string;
  size: number;
  width?: number;
  height?: number;
}

export interface StoredPost {
  id: string;
  channelId: number;
  kind: PostKind;
  text: string;
  language?: string;
  attachment?: StoredAttachment & { name: string };
  authorHash: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;
  updatedByName?: string;
}

export interface StoreOptions {
  retentionDays?: number;
  quotaBytes?: number;
  /** Anhänge ohne Beitrag (hochgeladen, nie angeheftet) werden danach gelöscht */
  orphanMinutes?: number;
  now?: () => number;
}

const DAY = 24 * 60 * 60 * 1000;
/** Beiträge gelöschter Kanäle bleiben so lange erhalten (ADR-0011) */
const REMOVED_CHANNEL_GRACE_DAYS = 7;

/** Ergebnis von `cleanup()`: Zahl gelöschter Beiträge und die betroffenen Räume */
export interface CleanupResult {
  removed: number;
  channels: number[];
}

/** Schema-Migrationen, in dieser Reihenfolge, nie nachträglich ändern */
const MIGRATIONS = [
  `CREATE TABLE posts (
     id TEXT PRIMARY KEY,
     channel_id INTEGER NOT NULL,
     kind TEXT NOT NULL CHECK (kind IN ('text','code','image','file')),
     text TEXT NOT NULL,
     language TEXT,
     attachment_id TEXT REFERENCES attachments(id),
     attachment_name TEXT,
     author_hash TEXT NOT NULL,
     author_name TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     updated_by_name TEXT
   );
   CREATE INDEX posts_channel ON posts(channel_id, created_at);
   CREATE TABLE attachments (
     id TEXT PRIMARY KEY,
     mime TEXT NOT NULL,
     size INTEGER NOT NULL,
     width INTEGER,
     height INTEGER,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE removed_channels (channel_id INTEGER PRIMARY KEY, removed_at INTEGER NOT NULL);`,
];

export class BoardStore {
  private readonly db: Database.Database;
  private readonly dir: string;
  private readonly opts: Required<StoreOptions>;

  constructor(dir: string, opts: StoreOptions = {}) {
    this.opts = { retentionDays: 30, quotaBytes: 2048 * 1024 * 1024, orphanMinutes: 60, now: Date.now, ...opts };
    this.dir = join(dir, "board");
    mkdirSync(this.dir, { recursive: true });
    this.db = new Database(join(dir, "board.sqlite"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    const version = this.db.pragma("user_version", { simple: true }) as number;
    for (let i = version; i < MIGRATIONS.length; i++) {
      this.db.transaction(() => {
        this.db.exec(MIGRATIONS[i]!);
        this.db.pragma(`user_version = ${i + 1}`);
      })();
    }
  }

  close(): void {
    this.db.close();
  }

  // ---------------------------------------------------------------- Beiträge

  list(channelId: number): StoredPost[] {
    return (this.db.prepare("SELECT p.*, a.mime, a.size, a.width, a.height FROM posts p LEFT JOIN attachments a ON a.id = p.attachment_id WHERE channel_id = ? ORDER BY p.created_at DESC, p.rowid DESC").all(channelId) as Row[]).map(toPost);
  }

  get(id: string): StoredPost | null {
    const row = this.db.prepare("SELECT p.*, a.mime, a.size, a.width, a.height FROM posts p LEFT JOIN attachments a ON a.id = p.attachment_id WHERE p.id = ?").get(id) as Row | undefined;
    return row ? toPost(row) : null;
  }

  create(input: { channelId: number; kind: PostKind; text: string; language?: string; attachmentId?: string; attachmentName?: string; authorHash: string; authorName: string }): StoredPost {
    const id = randomUUID();
    const now = this.opts.now();
    this.db
      .prepare(`INSERT INTO posts (id, channel_id, kind, text, language, attachment_id, attachment_name, author_hash, author_name, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, input.channelId, input.kind, input.text, input.language ?? null, input.attachmentId ?? null, input.attachmentName ?? null, input.authorHash, input.authorName, now, now);
    return this.get(id)!;
  }

  update(id: string, change: { text: string; language?: string }, editorName: string): StoredPost | null {
    const r = this.db
      .prepare("UPDATE posts SET text = ?, language = ?, updated_at = ?, updated_by_name = ? WHERE id = ?")
      .run(change.text, change.language ?? null, this.opts.now(), editorName, id);
    return r.changes ? this.get(id) : null;
  }

  delete(id: string): boolean {
    const post = this.db.prepare("SELECT attachment_id AS a FROM posts WHERE id = ?").get(id) as { a: string | null } | undefined;
    if (!post) return false;
    this.db.prepare("DELETE FROM posts WHERE id = ?").run(id);
    // nur den eigenen Anhang entfernen: frische Uploads anderer warten noch auf ihr Anheften
    if (post.a) this.removeIfUnreferenced(post.a);
    return true;
  }

  /** Anhang löschen, wenn kein Beitrag mehr darauf verweist (gleiche Inhalte liegen nur einmal vor) */
  private removeIfUnreferenced(attachmentId: string): void {
    if (this.db.prepare("SELECT 1 FROM posts WHERE attachment_id = ? LIMIT 1").get(attachmentId)) return;
    this.db.prepare("DELETE FROM attachments WHERE id = ?").run(attachmentId);
    rmSync(this.filePath(attachmentId), { force: true });
  }

  /** Räume, in denen etwas hängt */
  channelsWithPosts(): number[] {
    return (this.db.prepare("SELECT DISTINCT channel_id AS c FROM posts ORDER BY c").all() as { c: number }[]).map((r) => r.c);
  }

  // ---------------------------------------------------------------- Anhänge

  /** legt einen Anhang ab (doppelte Inhalte nur einmal) und liefert seine Beschreibung */
  putFile(bytes: Uint8Array, mime: string, dims?: { width: number; height: number }): StoredAttachment {
    const id = createHash("sha256").update(bytes).digest("hex");
    const path = this.filePath(id);
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, bytes, { mode: 0o600 });
      renameSync(tmp, path);
    }
    this.db
      .prepare("INSERT INTO attachments (id, mime, size, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING")
      .run(id, mime, bytes.length, dims?.width ?? null, dims?.height ?? null, this.opts.now());
    return this.attachment(id)!;
  }

  attachment(id: string): StoredAttachment | null {
    const a = this.db.prepare("SELECT * FROM attachments WHERE id = ?").get(id) as { id: string; mime: string; size: number; width: number | null; height: number | null } | undefined;
    return a ? { id: a.id, mime: a.mime, size: a.size, ...(a.width ? { width: a.width, height: a.height! } : {}) } : null;
  }

  filePath(id: string): string {
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("ungültige Anhang-ID");
    return join(this.dir, id.slice(0, 2), id);
  }

  /** Gesamtgröße aller Anhänge in Bytes */
  usedBytes(): number {
    return (this.db.prepare("SELECT COALESCE(SUM(size), 0) AS s FROM attachments").get() as { s: number }).s;
  }

  // ---------------------------------------------------------------- Aufräumen

  /** mit den vorhandenen Kanälen abgleichen: gelöschte merken, wieder aufgetauchte vergessen */
  syncChannels(existing: Iterable<number>): void {
    const ids = new Set(existing);
    const now = this.opts.now();
    const tx = this.db.transaction(() => {
      for (const c of this.channelsWithPosts()) {
        if (ids.has(c)) this.db.prepare("DELETE FROM removed_channels WHERE channel_id = ?").run(c);
        else this.db.prepare("INSERT INTO removed_channels (channel_id, removed_at) VALUES (?, ?) ON CONFLICT DO NOTHING").run(c, now);
      }
    });
    tx();
  }

  /** Aufbewahrung, gelöschte Kanäle, verwaiste Anhänge, Kontingent */
  cleanup(): CleanupResult {
    const now = this.opts.now();
    const channels = new Set<number>();
    const removeWhere = (where: string, ...args: unknown[]) => {
      const rows = this.db.prepare(`DELETE FROM posts WHERE ${where} RETURNING channel_id AS c`).all(...args) as { c: number }[];
      for (const r of rows) channels.add(r.c);
      return rows.length;
    };
    let removed = removeWhere("created_at < ?", now - this.opts.retentionDays * DAY);
    removed += removeWhere("channel_id IN (SELECT channel_id FROM removed_channels WHERE removed_at < ?)", now - REMOVED_CHANNEL_GRACE_DAYS * DAY);
    this.db.prepare("DELETE FROM removed_channels WHERE channel_id NOT IN (SELECT DISTINCT channel_id FROM posts)").run();
    this.removeOrphans(this.opts.orphanMinutes * 60_000);
    // Kontingent: älteste Beiträge mit Anhang zuerst, bis es wieder passt (ADR-0011)
    while (this.usedBytes() > this.opts.quotaBytes) {
      const oldest = this.db.prepare("SELECT id, channel_id AS c, attachment_id AS a FROM posts WHERE attachment_id IS NOT NULL ORDER BY created_at ASC, rowid ASC LIMIT 1").get() as { id: string; c: number; a: string } | undefined;
      if (!oldest) break;
      this.db.prepare("DELETE FROM posts WHERE id = ?").run(oldest.id);
      channels.add(oldest.c);
      removed++;
      this.removeIfUnreferenced(oldest.a);
    }
    return { removed, channels: [...channels] };
  }

  /** Anhänge ohne Beitrag löschen, die älter als `minAgeMs` sind (frisch hochgeladene warten auf ihr Anheften) */
  private removeOrphans(minAgeMs: number): void {
    const orphans = this.db
      .prepare("SELECT id FROM attachments WHERE id NOT IN (SELECT attachment_id FROM posts WHERE attachment_id IS NOT NULL) AND created_at <= ?")
      .all(this.opts.now() - minAgeMs) as { id: string }[];
    for (const { id } of orphans) {
      this.db.prepare("DELETE FROM attachments WHERE id = ?").run(id);
      rmSync(this.filePath(id), { force: true });
    }
  }

  /** konsistente Sicherung: SQLite-Backup-API, danach die Anhänge */
  async backup(target: string): Promise<void> {
    mkdirSync(join(target, "board"), { recursive: true });
    await this.db.backup(join(target, "board.sqlite"));
    for (const { id } of this.db.prepare("SELECT id FROM attachments").all() as { id: string }[]) {
      const dest = join(target, "board", id.slice(0, 2), id);
      mkdirSync(dirname(dest), { recursive: true });
      if (!existsSync(dest) || statSync(dest).size !== statSync(this.filePath(id)).size) copyFileSync(this.filePath(id), dest);
    }
  }
}

interface Row {
  id: string;
  channel_id: number;
  kind: PostKind;
  text: string;
  language: string | null;
  attachment_id: string | null;
  attachment_name: string | null;
  author_hash: string;
  author_name: string;
  created_at: number;
  updated_at: number;
  updated_by_name: string | null;
  mime: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
}

function toPost(r: Row): StoredPost {
  return {
    id: r.id,
    channelId: r.channel_id,
    kind: r.kind,
    text: r.text,
    ...(r.language ? { language: r.language } : {}),
    ...(r.attachment_id
      ? { attachment: { id: r.attachment_id, name: r.attachment_name ?? "", mime: r.mime ?? "application/octet-stream", size: r.size ?? 0, ...(r.width ? { width: r.width, height: r.height! } : {}) } }
      : {}),
    authorHash: r.author_hash,
    authorName: r.author_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.updated_by_name ? { updatedByName: r.updated_by_name } : {}),
  };
}
