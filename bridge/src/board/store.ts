/**
 * Board storage (ADR-0011): SQLite for posts, attachments as files by SHA-256.
 * Retention, quota and deleted channels are cleaned up by `cleanup()` (hourly from main.ts).
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import type { PostKind, ReactionKind } from "@ruumble/protocol";

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
  /** oldest first */
  reactions: StoredReaction[];
}

export interface StoredReaction {
  kind: ReactionKind;
  authorHash: string;
  authorName: string;
}

export interface StoreOptions {
  retentionDays?: number;
  quotaBytes?: number;
  /** attachments without a post (uploaded, never pinned) are deleted after this */
  orphanMinutes?: number;
  now?: () => number;
}

const DAY = 24 * 60 * 60 * 1000;
/** posts of deleted channels are kept this long (ADR-0011) */
const REMOVED_CHANNEL_GRACE_DAYS = 7;

/** Result of `cleanup()`: number of deleted posts and the affected rooms */
export interface CleanupResult {
  removed: number;
  channels: number[];
}

/** Schema migrations, in this order, never change them afterwards (exported for the migration test) */
export const MIGRATIONS = [
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
  // A1: quick reactions, deleted together with the post
  `CREATE TABLE reactions (
     post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
     kind TEXT NOT NULL CHECK (kind IN ('agree','looking','done','broken','unclear')),
     author_hash TEXT NOT NULL,
     author_name TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (post_id, kind, author_hash)
   );`,
  // more reaction kinds: without the CHECK, the kinds are validated in code (ReactionKind), so new ones need no migration
  `CREATE TABLE reactions_new (
     post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
     kind TEXT NOT NULL,
     author_hash TEXT NOT NULL,
     author_name TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (post_id, kind, author_hash)
   );
   INSERT INTO reactions_new SELECT post_id, kind, author_hash, author_name, created_at FROM reactions;
   DROP TABLE reactions;
   ALTER TABLE reactions_new RENAME TO reactions;`,
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

  // ---------------------------------------------------------------- Posts

  list(channelId: number): StoredPost[] {
    const rows = this.db.prepare("SELECT p.*, a.mime, a.size, a.width, a.height FROM posts p LEFT JOIN attachments a ON a.id = p.attachment_id WHERE channel_id = ? ORDER BY p.created_at DESC, p.rowid DESC").all(channelId) as Row[];
    const reactions = this.reactionsOf("SELECT r.* FROM reactions r JOIN posts p ON p.id = r.post_id WHERE p.channel_id = ? ORDER BY r.created_at, r.rowid", channelId);
    return rows.map((r) => toPost(r, reactions.get(r.id)));
  }

  get(id: string): StoredPost | null {
    const row = this.db.prepare("SELECT p.*, a.mime, a.size, a.width, a.height FROM posts p LEFT JOIN attachments a ON a.id = p.attachment_id WHERE p.id = ?").get(id) as Row | undefined;
    return row ? toPost(row, this.reactionsOf("SELECT * FROM reactions WHERE post_id = ? ORDER BY created_at, rowid", id).get(id)) : null;
  }

  private reactionsOf(sql: string, arg: unknown): Map<string, StoredReaction[]> {
    const byPost = new Map<string, StoredReaction[]>();
    for (const r of this.db.prepare(sql).all(arg) as { post_id: string; kind: ReactionKind; author_hash: string; author_name: string }[]) {
      const list = byPost.get(r.post_id) ?? [];
      list.push({ kind: r.kind, authorHash: r.author_hash, authorName: r.author_name });
      byPost.set(r.post_id, list);
    }
    return byPost;
  }

  /** set or take back a reaction (A1); does not count as an edit. `false` if the post does not exist */
  react(postId: string, kind: ReactionKind, on: boolean, author: { hash: string; name: string }): boolean {
    if (!this.db.prepare("SELECT 1 FROM posts WHERE id = ?").get(postId)) return false;
    if (on) {
      this.db
        .prepare("INSERT INTO reactions (post_id, kind, author_hash, author_name, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING")
        .run(postId, kind, author.hash, author.name, this.opts.now());
    } else {
      this.db.prepare("DELETE FROM reactions WHERE post_id = ? AND kind = ? AND author_hash = ?").run(postId, kind, author.hash);
    }
    return true;
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
    // only remove the post's own attachment: fresh uploads by others are still waiting to be pinned
    if (post.a) this.removeIfUnreferenced(post.a);
    return true;
  }

  /** delete an attachment once no post references it any more (identical contents are stored only once) */
  private removeIfUnreferenced(attachmentId: string): void {
    if (this.db.prepare("SELECT 1 FROM posts WHERE attachment_id = ? LIMIT 1").get(attachmentId)) return;
    this.db.prepare("DELETE FROM attachments WHERE id = ?").run(attachmentId);
    rmSync(this.filePath(attachmentId), { force: true });
  }

  /** rooms that have something pinned */
  channelsWithPosts(): number[] {
    return (this.db.prepare("SELECT DISTINCT channel_id AS c FROM posts ORDER BY c").all() as { c: number }[]).map((r) => r.c);
  }

  // ---------------------------------------------------------------- Attachments

  /** stores an attachment (duplicate contents only once) and returns its description */
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
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("invalid attachment ID");
    return join(this.dir, id.slice(0, 2), id);
  }

  /** total size of all attachments in bytes */
  usedBytes(): number {
    return (this.db.prepare("SELECT COALESCE(SUM(size), 0) AS s FROM attachments").get() as { s: number }).s;
  }

  // ---------------------------------------------------------------- Cleanup

  /** reconcile with the existing channels: remember deleted ones, forget ones that reappeared */
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

  /** retention, deleted channels, orphaned attachments, quota */
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
    // quota: oldest posts with an attachment first, until it fits again (ADR-0011)
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

  /** delete attachments without a post that are older than `minAgeMs` (fresh uploads are waiting to be pinned) */
  private removeOrphans(minAgeMs: number): void {
    const orphans = this.db
      .prepare("SELECT id FROM attachments WHERE id NOT IN (SELECT attachment_id FROM posts WHERE attachment_id IS NOT NULL) AND created_at <= ?")
      .all(this.opts.now() - minAgeMs) as { id: string }[];
    for (const { id } of orphans) {
      this.db.prepare("DELETE FROM attachments WHERE id = ?").run(id);
      rmSync(this.filePath(id), { force: true });
    }
  }

  /** consistent backup: SQLite backup API, then the attachments */
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

function toPost(r: Row, reactions: StoredReaction[] = []): StoredPost {
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
    reactions,
  };
}
