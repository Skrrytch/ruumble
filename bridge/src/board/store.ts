/**
 * Board storage (ADR-0011): SQLite for posts, attachments as files by SHA-256.
 * Retention, quota and deleted channels are cleaned up by `cleanup()` (hourly from main.ts).
 * Care (ADR-0014): the last known place of every floor and room, so the data of rooms that are gone can be
 * found from their floor and removed by hand.
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { learnTicketLinks, type BuildingSettings, type Channel, type PostKind, type ReactionKind, type TicketLinks } from "@ruumble/protocol";

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
  copiedFrom?: { roomName: string; authorName: string };
  /** oldest first */
  reactions: StoredReaction[];
}

export interface StoredReaction {
  kind: ReactionKind;
  authorHash: string;
  authorName: string;
}

export interface StoreOptions {
  /** defaults of the building settings (environment variables); maintenance may override them (ADR-0016) */
  retentionDays?: number;
  quotaBytes?: number;
  maxFileMB?: number;
  graceDays?: number;
  notifyNewPosts?: boolean;
  /** attachments without a post (uploaded, never pinned) are deleted after this */
  orphanMinutes?: number;
  now?: () => number;
}

const DAY = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;

/** Result of `cleanup()`: number of deleted posts and the affected rooms */
export interface CleanupResult {
  removed: number;
  channels: number[];
}

/** a channel as far as the place of floors and rooms is concerned */
export type ChannelPlace = Pick<Channel, "id" | "parent" | "name" | "temporary">;

/**
 * Board data of a room that is no longer a room (deleted, or moved out of the floor plan), with its last known place.
 * `floorId` null: not known (data from before migration 5, or the room became a floor itself).
 */
export interface OrphanedRoom {
  channelId: number;
  floorId: number | null;
  name: string;
  posts: number;
  bytes: number;
  /** when the channel was found missing; null if it still exists elsewhere */
  goneSince: number | null;
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
  // A3: at most one post per room kept on top; goes away with the post
  `CREATE TABLE pins (
     channel_id INTEGER PRIMARY KEY,
     post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     pinned_by_name TEXT NOT NULL,
     pinned_at INTEGER NOT NULL
   );`,
  // copy to another room: where it came from
  `ALTER TABLE posts ADD COLUMN copied_from_room TEXT;
   ALTER TABLE posts ADD COLUMN copied_from_author TEXT;`,
  // care (ADR-0014): last known place of floors (parent 0) and rooms; ticket links reset per project
  `CREATE TABLE channels (channel_id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL, name TEXT NOT NULL);
   CREATE TABLE forgotten_tickets (project TEXT PRIMARY KEY, forgotten_at INTEGER NOT NULL);`,
  // building maintenance (ADR-0016): settings that differ from the defaults, as JSON values
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

export class BoardStore {
  private readonly db: Database.Database;
  private readonly dir: string;
  private readonly opts: Required<StoreOptions>;
  /** effective building settings: defaults with the stored overrides */
  private current: BuildingSettings;
  /** learned ticket links, recomputed after a change to the posts */
  private tickets: TicketLinks | null = null;
  /** current floors and rooms with a board, from the last `syncChannels`; null before the first one */
  private places: { floors: Set<number>; rooms: Set<number> } | null = null;

  constructor(dir: string, opts: StoreOptions = {}) {
    this.opts = { retentionDays: 365, quotaBytes: 2048 * MB, maxFileMB: 10, graceDays: 7, notifyNewPosts: true, orphanMinutes: 60, now: Date.now, ...opts };
    this.dir = join(dir, "board");
    mkdirSync(this.dir, { recursive: true });
    this.db = new Database(join(dir, "board.sqlite"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
    this.current = this.loadSettings();
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

  // ---------------------------------------------------------------- Building settings (ADR-0016)

  /** the defaults: environment variables, else built in */
  get settingDefaults(): BuildingSettings {
    const o = this.opts;
    return { retentionDays: o.retentionDays, quotaMB: Math.round(o.quotaBytes / MB), maxFileMB: o.maxFileMB, graceDays: o.graceDays, notifyNewPosts: o.notifyNewPosts };
  }

  get settings(): BuildingSettings {
    return { ...this.current };
  }

  /** store the settings; only values that differ from the defaults are kept, so a changed default still applies */
  saveSettings(next: BuildingSettings): BuildingSettings {
    const defaults = this.settingDefaults;
    this.db.transaction(() => {
      this.db.prepare("DELETE FROM settings").run();
      const put = this.db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
      for (const key of Object.keys(defaults) as (keyof BuildingSettings)[]) if (next[key] !== defaults[key]) put.run(key, JSON.stringify(next[key]));
    })();
    this.current = this.loadSettings();
    return this.settings;
  }

  private loadSettings(): BuildingSettings {
    const merged: Record<string, unknown> = { ...this.settingDefaults };
    for (const { key, value } of this.db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[]) {
      if (key in merged && typeof JSON.parse(value) === typeof merged[key]) merged[key] = JSON.parse(value);
    }
    return merged as unknown as BuildingSettings;
  }

  /** posts are deleted automatically after this many days (ADR-0011) */
  get retentionDays(): number {
    return this.current.retentionDays;
  }

  /** in bytes: without an override exactly the default (tests use quotas below one MB) */
  get quotaBytes(): number {
    return this.current.quotaMB === this.settingDefaults.quotaMB ? this.opts.quotaBytes : this.current.quotaMB * MB;
  }

  get maxFileBytes(): number {
    return this.current.maxFileMB * MB;
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

  /** the post kept on top of the room (A3), or null */
  pinned(channelId: number): { postId: string; title: string; pinnedByName: string; pinnedAt: number } | null {
    const r = this.db.prepare("SELECT post_id, title, pinned_by_name, pinned_at FROM pins WHERE channel_id = ?").get(channelId) as
      | { post_id: string; title: string; pinned_by_name: string; pinned_at: number }
      | undefined;
    return r ? { postId: r.post_id, title: r.title, pinnedByName: r.pinned_by_name, pinnedAt: r.pinned_at } : null;
  }

  /** keep a post on top of its room, replacing the previous one; `false` if the post is not in that room */
  pin(channelId: number, postId: string, title: string, byName: string): boolean {
    if (!this.db.prepare("SELECT 1 FROM posts WHERE id = ? AND channel_id = ?").get(postId, channelId)) return false;
    this.db
      .prepare("INSERT INTO pins (channel_id, post_id, title, pinned_by_name, pinned_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(channel_id) DO UPDATE SET post_id = excluded.post_id, title = excluded.title, pinned_by_name = excluded.pinned_by_name, pinned_at = excluded.pinned_at")
      .run(channelId, postId, title, byName, this.opts.now());
    return true;
  }

  unpin(channelId: number): void {
    this.db.prepare("DELETE FROM pins WHERE channel_id = ?").run(channelId);
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

  create(input: {
    channelId: number; kind: PostKind; text: string; language?: string; attachmentId?: string; attachmentName?: string; authorHash: string; authorName: string;
    copiedFrom?: { roomName: string; authorName: string };
  }): StoredPost {
    const id = randomUUID();
    const now = this.opts.now();
    this.tickets = null;
    this.db
      .prepare(`INSERT INTO posts (id, channel_id, kind, text, language, attachment_id, attachment_name, author_hash, author_name, created_at, updated_at, copied_from_room, copied_from_author)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        id, input.channelId, input.kind, input.text, input.language ?? null, input.attachmentId ?? null, input.attachmentName ?? null, input.authorHash, input.authorName, now, now,
        input.copiedFrom?.roomName ?? null, input.copiedFrom?.authorName ?? null,
      );
    return this.get(id)!;
  }

  update(id: string, change: { text: string; language?: string }, editorName: string): StoredPost | null {
    this.tickets = null;
    const r = this.db
      .prepare("UPDATE posts SET text = ?, language = ?, updated_at = ?, updated_by_name = ? WHERE id = ?")
      .run(change.text, change.language ?? null, this.opts.now(), editorName, id);
    return r.changes ? this.get(id) : null;
  }

  delete(id: string): boolean {
    const post = this.db.prepare("SELECT attachment_id AS a FROM posts WHERE id = ?").get(id) as { a: string | null } | undefined;
    if (!post) return false;
    this.db.prepare("DELETE FROM posts WHERE id = ?").run(id);
    this.tickets = null;
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

  /**
   * Ticket links learned from the issue links in all posts, in every room: the oldest post wins, so a later link
   * cannot redirect a known project. Derived from the posts, so it forgets what expires or is deleted with them.
   */
  ticketLinks(): TicketLinks {
    if (!this.tickets) {
      const links: TicketLinks = {};
      // forgotten projects (care): only posts created after the reset teach them again
      const forgotten = new Map((this.db.prepare("SELECT project, forgotten_at AS at FROM forgotten_tickets").all() as { project: string; at: number }[]).map((r) => [r.project, r.at]));
      for (const { text, created_at } of this.db.prepare("SELECT text, created_at FROM posts WHERE text LIKE '%/browse/%' ORDER BY created_at, rowid").all() as { text: string; created_at: number }[]) {
        for (const [project, base] of Object.entries(learnTicketLinks(text))) {
          if (!Object.hasOwn(links, project) && created_at > (forgotten.get(project) ?? -Infinity)) links[project] = base;
        }
      }
      this.tickets = links;
    }
    return this.tickets;
  }

  /** forget the learned links of these projects: posts created until now no longer teach them (care, ADR-0014) */
  forgetTickets(projects: Iterable<string>): void {
    const now = this.opts.now();
    const stmt = this.db.prepare("INSERT INTO forgotten_tickets (project, forgotten_at) VALUES (?, ?) ON CONFLICT(project) DO UPDATE SET forgotten_at = excluded.forgotten_at");
    this.db.transaction(() => {
      for (const p of projects) stmt.run(p, now);
    })();
    this.tickets = null;
  }

  // ---------------------------------------------------------------- Care (ADR-0014)

  /** number of posts and size of their attachments in a room */
  roomStats(channelId: number): { posts: number; bytes: number } {
    return this.db
      .prepare("SELECT COUNT(*) AS posts, COALESCE(SUM(a.size), 0) AS bytes FROM posts p LEFT JOIN attachments a ON a.id = p.attachment_id WHERE p.channel_id = ?")
      .get(channelId) as { posts: number; bytes: number };
  }

  /** clear a room's board: all posts with their reactions, pin and attachments; returns the number of posts */
  clearRoom(channelId: number): number {
    return this.deletePosts("channel_id = ?", channelId);
  }

  /** delete the posts of a room created before `before` (with reactions, pin, attachments); returns their number */
  pruneRoom(channelId: number, before: number): number {
    return this.deletePosts("channel_id = ? AND created_at < ?", channelId, before);
  }

  private deletePosts(where: string, ...args: unknown[]): number {
    const rows = this.db.prepare(`DELETE FROM posts WHERE ${where} RETURNING attachment_id AS a`).all(...args) as { a: string | null }[];
    this.tickets = null;
    for (const a of new Set(rows.flatMap((r) => (r.a ? [r.a] : [])))) this.removeIfUnreferenced(a);
    return rows.length;
  }

  /** per room with posts: number, attachment size, creation time of the newest and the oldest post */
  channelStats(): Map<number, { posts: number; bytes: number; newest: number; oldest: number }> {
    const rows = this.db
      .prepare("SELECT p.channel_id AS id, COUNT(*) AS posts, COALESCE(SUM(a.size), 0) AS bytes, MAX(p.created_at) AS newest, MIN(p.created_at) AS oldest FROM posts p LEFT JOIN attachments a ON a.id = p.attachment_id GROUP BY p.channel_id")
      .all() as { id: number; posts: number; bytes: number; newest: number; oldest: number }[];
    return new Map(rows.map(({ id, ...r }) => [id, r]));
  }

  /** creation times of a room's posts, oldest first */
  postTimes(channelId: number): number[] {
    return (this.db.prepare("SELECT created_at AS t FROM posts WHERE channel_id = ? ORDER BY created_at").all(channelId) as { t: number }[]).map((r) => r.t);
  }

  /**
   * move every post of one room to another (care: a room recreated in Mumble gets a new ID). Authors, times and
   * reactions stay; the target keeps its own post on top, otherwise the source's comes along. Returns the number.
   */
  moveRoom(from: number, to: number): number {
    if (from === to) return 0;
    let moved = 0;
    this.db.transaction(() => {
      moved = this.db.prepare("UPDATE posts SET channel_id = ? WHERE channel_id = ?").run(to, from).changes;
      if (this.db.prepare("SELECT 1 FROM pins WHERE channel_id = ?").get(to)) this.db.prepare("DELETE FROM pins WHERE channel_id = ?").run(from);
      else this.db.prepare("UPDATE pins SET channel_id = ? WHERE channel_id = ?").run(to, from);
      this.db.prepare("DELETE FROM removed_channels WHERE channel_id = ?").run(from);
    })();
    this.pruneChannels();
    return moved;
  }

  /** last known floor of a room (parent in `channels`), null if not known */
  placeFloor(channelId: number): number | null {
    const r = this.db.prepare("SELECT parent_id AS p FROM channels WHERE channel_id = ?").get(channelId) as { p: number } | undefined;
    return r && r.p !== 0 ? r.p : null;
  }

  /** board data of channels that are no longer rooms, with their last known place; empty before the first sync */
  orphanedRooms(): OrphanedRoom[] {
    const rooms = this.places?.rooms;
    if (!rooms) return [];
    const rows = this.db
      .prepare(`SELECT p.channel_id AS id, c.parent_id AS parent, c.name, COUNT(*) AS posts, COALESCE(SUM(a.size), 0) AS bytes, r.removed_at AS gone
                FROM posts p LEFT JOIN channels c ON c.channel_id = p.channel_id LEFT JOIN attachments a ON a.id = p.attachment_id
                LEFT JOIN removed_channels r ON r.channel_id = p.channel_id
                GROUP BY p.channel_id ORDER BY c.name IS NULL, c.name, p.channel_id`)
      .all() as { id: number; parent: number | null; name: string | null; posts: number; bytes: number; gone: number | null }[];
    return rows
      .filter((r) => !rooms.has(r.id))
      .map((r) => ({ channelId: r.id, floorId: r.parent ? r.parent : null, name: r.name ?? "", posts: r.posts, bytes: r.bytes, goneSince: r.gone }));
  }

  /** last known name of a floor or room */
  placeName(channelId: number): string {
    return (this.db.prepare("SELECT name FROM channels WHERE channel_id = ?").get(channelId) as { name: string } | undefined)?.name ?? "";
  }

  /** remove all data of these rooms, as far as they are no longer rooms; returns the number of posts removed */
  removeRooms(channelIds: Iterable<number>): number {
    const orphaned = new Set(this.orphanedRooms().map((r) => r.channelId));
    let removed = 0;
    for (const id of channelIds) {
      if (!orphaned.has(id)) continue;
      removed += this.clearRoom(id);
      this.db.prepare("DELETE FROM removed_channels WHERE channel_id = ?").run(id);
    }
    this.pruneChannels();
    return removed;
  }

  /** forget the places of floors and rooms that are gone and hold no data any more */
  private pruneChannels(): void {
    const places = this.places;
    if (!places) return;
    const withPosts = new Set(this.channelsWithPosts());
    const rows = this.db.prepare("SELECT channel_id AS id, parent_id AS parent FROM channels").all() as { id: number; parent: number }[];
    const rooms = rows.filter((r) => r.parent !== 0 && (places.rooms.has(r.id) || withPosts.has(r.id)));
    const floorsInUse = new Set(rooms.map((r) => r.parent));
    const drop = this.db.prepare("DELETE FROM channels WHERE channel_id = ?");
    this.db.transaction(() => {
      for (const r of rows) {
        const keep = r.parent === 0 ? places.floors.has(r.id) || floorsInUse.has(r.id) : places.rooms.has(r.id) || withPosts.has(r.id);
        if (!keep) drop.run(r.id);
      }
    })();
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

  /**
   * reconcile with the existing channels: remember deleted ones, forget ones that reappeared, and note the place
   * of every floor (child of the root) and room (not temporary, on a floor) for care (ADR-0014)
   */
  syncChannels(channels: readonly ChannelPlace[]): void {
    const ids = new Set(channels.map((c) => c.id));
    const floors = new Set(channels.filter((c) => c.parent === 0).map((c) => c.id));
    const rooms = channels.filter((c) => c.parent !== null && floors.has(c.parent) && !c.temporary);
    this.places = { floors, rooms: new Set(rooms.map((c) => c.id)) };
    const now = this.opts.now();
    const place = this.db.prepare(
      "INSERT INTO channels (channel_id, parent_id, name) VALUES (?, ?, ?) ON CONFLICT(channel_id) DO UPDATE SET parent_id = excluded.parent_id, name = excluded.name WHERE parent_id != excluded.parent_id OR name != excluded.name",
    );
    const tx = this.db.transaction(() => {
      for (const c of this.channelsWithPosts()) {
        if (ids.has(c)) this.db.prepare("DELETE FROM removed_channels WHERE channel_id = ?").run(c);
        else this.db.prepare("INSERT INTO removed_channels (channel_id, removed_at) VALUES (?, ?) ON CONFLICT DO NOTHING").run(c, now);
      }
      for (const c of channels) if (floors.has(c.id)) place.run(c.id, 0, c.name);
      for (const c of rooms) place.run(c.id, c.parent, c.name);
    });
    tx();
  }

  /** retention, deleted channels, orphaned attachments, quota */
  cleanup(): CleanupResult {
    const now = this.opts.now();
    const channels = new Set<number>();
    this.tickets = null;
    const removeWhere = (where: string, ...args: unknown[]) => {
      const rows = this.db.prepare(`DELETE FROM posts WHERE ${where} RETURNING channel_id AS c`).all(...args) as { c: number }[];
      for (const r of rows) channels.add(r.c);
      return rows.length;
    };
    let removed = removeWhere("created_at < ?", now - this.retentionDays * DAY);
    removed += removeWhere("channel_id IN (SELECT channel_id FROM removed_channels WHERE removed_at < ?)", now - this.current.graceDays * DAY);
    this.db.prepare("DELETE FROM removed_channels WHERE channel_id NOT IN (SELECT DISTINCT channel_id FROM posts)").run();
    // every post a reset was about has expired by now
    this.db.prepare("DELETE FROM forgotten_tickets WHERE forgotten_at < ?").run(now - this.retentionDays * DAY);
    this.removeOrphans(this.opts.orphanMinutes * 60_000);
    // quota: oldest posts with an attachment first, until it fits again (ADR-0011)
    while (this.usedBytes() > this.quotaBytes) {
      const oldest = this.db.prepare("SELECT id, channel_id AS c, attachment_id AS a FROM posts WHERE attachment_id IS NOT NULL ORDER BY created_at ASC, rowid ASC LIMIT 1").get() as { id: string; c: number; a: string } | undefined;
      if (!oldest) break;
      this.db.prepare("DELETE FROM posts WHERE id = ?").run(oldest.id);
      channels.add(oldest.c);
      removed++;
      this.removeIfUnreferenced(oldest.a);
    }
    this.pruneChannels();
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
  copied_from_room: string | null;
  copied_from_author: string | null;
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
    ...(r.copied_from_room !== null ? { copiedFrom: { roomName: r.copied_from_room, authorName: r.copied_from_author ?? "" } } : {}),
    reactions,
  };
}
