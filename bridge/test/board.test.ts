import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { BridgeToPlugin, BridgeToUi, PostKind } from "@ruumble/protocol";
import { imageSize, safeFileName } from "../src/board/media.ts";
import { careRoutes, orphanedFloors } from "../src/board/care.ts";
import { clearedText, notifyCleared, notifyRoom, notifyText } from "../src/board/notify.ts";
import { boardRoutes } from "../src/board/routes.ts";
import { BoardStore, MIGRATIONS } from "../src/board/store.ts";
import { Hub } from "../src/hub.ts";
import { Pairing } from "../src/pairing.ts";
import { Poller } from "../src/poller.ts";
import { FakeSource, recorder } from "./fake.ts";

const DAY = 24 * 60 * 60 * 1000;
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000040000000200806000000", "hex"); // 64×32
const A = "a".repeat(40), B = "b".repeat(40);

/** channels for syncChannels: root, floors and rooms (`[id, parent, name]`) */
const places = (...list: [number, number | null, string][]) => list.map(([id, parent, name]) => ({ id, parent, name, temporary: false }));
const tempStore = (opts: ConstructorParameters<typeof BoardStore>[1] = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "ruumble-board-"));
  return { store: new BoardStore(dir, opts), dir };
};

describe("media", () => {
  it("reads image dimensions from the file header", () => {
    expect(imageSize(PNG, "image/png")).toEqual({ width: 64, height: 32 });
    expect(imageSize(Buffer.from("GIF89a\x10\x00\x08\x00", "latin1"), "image/gif")).toEqual({ width: 16, height: 8 });
    expect(imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 20, 0, 40, 3]), "image/jpeg")).toEqual({ width: 40, height: 20 });
    expect(imageSize(Buffer.alloc(4), "image/png")).toBeNull();
  });

  it("sanitises file names", () => {
    expect(safeFileName("..%2F..%2Fetc%2Fpasswd")).toBe(".._.._etc_passwd");
    expect(safeFileName(encodeURIComponent("Report (final).pdf"))).toBe("Report (final).pdf");
    expect(safeFileName(undefined)).toBe("file");
    expect(safeFileName("%E0%A4%A")).toBe("%E0%A4%A"); // broken encoding → raw
  });
});

describe("BoardStore", () => {
  it("creates, lists newest first, edits and deletes", () => {
    const { store } = tempStore();
    const a = store.create({ channelId: 3, kind: "text", text: "first", authorHash: A, authorName: "Anna" });
    const b = store.create({ channelId: 3, kind: "code", text: "x = 1", language: "python", authorHash: B, authorName: "Ben" });
    store.create({ channelId: 4, kind: "text", text: "elsewhere", authorHash: A, authorName: "Anna" });
    expect(store.list(3).map((p) => p.id)).toEqual([b.id, a.id]);
    expect(store.channelsWithPosts()).toEqual([3, 4]);
    expect(store.update(a.id, { text: "changed" }, "Ben")).toMatchObject({ text: "changed", updatedByName: "Ben" });
    expect(store.delete(a.id)).toBe(true);
    expect(store.delete(a.id)).toBe(false);
    expect(store.get(b.id)?.language).toBe("python");
  });

  it("attachments: each content stored once, orphans are removed", () => {
    const { store } = tempStore({ orphanMinutes: 0 });
    const att = store.putFile(PNG, "image/png", { width: 64, height: 32 });
    expect(store.putFile(PNG, "image/png").id).toBe(att.id);
    const p = store.create({ channelId: 3, kind: "image", text: "", attachmentId: att.id, attachmentName: "image.png", authorHash: A, authorName: "Anna" });
    expect(store.get(p.id)?.attachment).toMatchObject({ id: att.id, name: "image.png", mime: "image/png", width: 64 });
    expect(existsSync(store.filePath(att.id))).toBe(true);
    store.delete(p.id);
    expect(store.attachment(att.id)).toBeNull();
    expect(existsSync(store.filePath(att.id))).toBe(false);
  });

  it("deleting a post leaves other people's fresh uploads alone", () => {
    const { store } = tempStore();
    const mine = store.putFile(PNG, "image/png");
    const p = store.create({ channelId: 3, kind: "image", text: "", attachmentId: mine.id, attachmentName: "a.png", authorHash: A, authorName: "Anna" });
    const pending = store.putFile(Buffer.from("not pinned yet"), "text/plain"); // Ben is uploading right now
    store.delete(p.id);
    expect(store.attachment(mine.id)).toBeNull();
    expect(store.attachment(pending.id)).not.toBeNull();
    expect(existsSync(store.filePath(pending.id))).toBe(true);
  });

  it("retention 30 days, deleted channels after 7 days", () => {
    let now = 1_000 * DAY;
    const { store } = tempStore({ now: () => now });
    store.create({ channelId: 3, kind: "text", text: "old", authorHash: A, authorName: "Anna" });
    now += 10 * DAY;
    store.create({ channelId: 5, kind: "text", text: "channel disappears", authorHash: A, authorName: "Anna" });
    store.syncChannels(places([0, null, "Root"], [1, 0, "1F"], [3, 1, "Office"])); // channel 5 is gone
    now += 8 * DAY;
    expect(store.cleanup()).toEqual({ removed: 1, channels: [5] }); // channel 5 after 7 days
    now += 13 * DAY; // post in 3 is now 31 days old
    expect(store.cleanup().removed).toBe(1);
    expect(store.channelsWithPosts()).toEqual([]);
  });

  it("reappeared channel is not deleted", () => {
    let now = 0;
    const { store } = tempStore({ now: () => now });
    store.create({ channelId: 5, kind: "text", text: "x", authorHash: A, authorName: "Anna" });
    store.syncChannels([]);
    now += 3 * DAY;
    store.syncChannels(places([0, null, "Root"], [1, 0, "1F"], [5, 1, "Office"]));
    now += 5 * DAY;
    expect(store.cleanup().removed).toBe(0);
  });

  it("quota: oldest posts with attachment first", () => {
    let now = 0;
    const { store } = tempStore({ quotaBytes: 250, orphanMinutes: 0, now: () => now });
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      now += 1000;
      const att = store.putFile(Buffer.alloc(100, i + 1), "application/octet-stream");
      ids.push(store.create({ channelId: 3, kind: "file", text: "", attachmentId: att.id, attachmentName: `f${i}`, authorHash: A, authorName: "Anna" }).id);
    }
    expect(store.usedBytes()).toBe(300);
    expect(store.cleanup().removed).toBe(1);
    expect(store.list(3).map((p) => p.id)).toEqual([ids[2], ids[1]]);
  });

  it("reactions: once per kind and person, oldest first, deleted with the post (A1)", () => {
    let now = 1_000;
    const { store } = tempStore({ now: () => now });
    const p = store.create({ channelId: 3, kind: "text", text: "x", authorHash: A, authorName: "Anna" });
    expect(store.react(p.id, "agree", true, { hash: B, name: "Ben" })).toBe(true);
    now++;
    store.react(p.id, "agree", true, { hash: A, name: "Anna" });
    store.react(p.id, "agree", true, { hash: B, name: "Ben (new name)" }); // twice: no second reaction
    store.react(p.id, "done", true, { hash: A, name: "Anna" });
    expect(store.get(p.id)?.reactions).toEqual([
      { kind: "agree", authorHash: B, authorName: "Ben" },
      { kind: "agree", authorHash: A, authorName: "Anna" },
      { kind: "done", authorHash: A, authorName: "Anna" },
    ]);
    expect(store.list(3)[0]?.reactions).toHaveLength(3);
    store.react(p.id, "agree", false, { hash: B, name: "Ben" });
    expect(store.get(p.id)?.reactions.map((r) => r.authorName)).toEqual(["Anna", "Anna"]);
    expect(store.get(p.id)?.updatedByName).toBeUndefined(); // not an edit
    expect(store.react("missing", "agree", true, { hash: A, name: "Anna" })).toBe(false);
    store.delete(p.id);
    const q = store.create({ channelId: 3, kind: "text", text: "y", authorHash: A, authorName: "Anna" });
    expect(store.get(q.id)?.reactions).toEqual([]);
  });

  it("kept on top: one per room, replaced, removed with the post (A3)", () => {
    let now = 5;
    const { store } = tempStore({ now: () => now });
    const a = store.create({ channelId: 3, kind: "text", text: "a", authorHash: A, authorName: "Anna" });
    const b = store.create({ channelId: 3, kind: "text", text: "b", authorHash: A, authorName: "Anna" });
    const other = store.create({ channelId: 4, kind: "text", text: "c", authorHash: A, authorName: "Anna" });
    expect(store.pinned(3)).toBeNull();
    expect(store.pin(3, other.id, "wrong room", "Anna")).toBe(false);
    expect(store.pin(3, a.id, "First", "Anna")).toBe(true);
    now = 6;
    store.pin(3, b.id, "Second", "Ben"); // replaces
    expect(store.pinned(3)).toEqual({ postId: b.id, title: "Second", pinnedByName: "Ben", pinnedAt: 6 });
    store.pin(4, other.id, "Other room", "Ben");
    store.delete(b.id);
    expect(store.pinned(3)).toBeNull();
    expect(store.pinned(4)?.postId).toBe(other.id);
    store.unpin(4);
    expect(store.pinned(4)).toBeNull();
  });

  it("ticket links: learned from issue links in all rooms, oldest post wins, forgotten with the post", () => {
    const { store } = tempStore();
    expect(store.ticketLinks()).toEqual({});
    const first = store.create({ channelId: 3, kind: "text", text: "https://jira.example/browse/TAG-1", authorHash: A, authorName: "Anna" });
    store.create({ channelId: 4, kind: "code", text: "// https://evil.example/browse/TAG-2\n// https://jira.example/browse/VKB-3", authorHash: B, authorName: "Ben" });
    expect(store.ticketLinks()).toEqual({ TAG: "https://jira.example/browse/", VKB: "https://jira.example/browse/" });
    store.update(first.id, { text: "no link any more" }, "Anna");
    expect(store.ticketLinks().TAG).toBe("https://evil.example/browse/");
    store.delete(store.list(4)[0]!.id);
    expect(store.ticketLinks()).toEqual({});
  });

  it("ticket links: forgetting a project ignores older posts, newer ones teach it again (care)", () => {
    let now = 1_000;
    const { store } = tempStore({ now: () => now });
    store.create({ channelId: 3, kind: "text", text: "https://wrong.example/browse/TAG-1 and https://jira.example/browse/VKB-3", authorHash: A, authorName: "Anna" });
    expect(store.ticketLinks().TAG).toBe("https://wrong.example/browse/");
    store.forgetTickets(["TAG"]);
    expect(store.ticketLinks()).toEqual({ VKB: "https://jira.example/browse/" });
    now += 1;
    store.create({ channelId: 4, kind: "text", text: "https://jira.example/browse/TAG-2", authorHash: B, authorName: "Ben" });
    expect(store.ticketLinks().TAG).toBe("https://jira.example/browse/");
  });

  it("care: clear a room, find and remove rooms and floors that are gone", () => {
    let now = 0;
    const { store } = tempStore({ now: () => now, orphanMinutes: 0 });
    const building = places([0, null, "Root"], [1, 0, "1F"], [2, 1, "Office"], [3, 1, "Lab"], [4, 0, "2F"], [5, 4, "Archive"]);
    store.syncChannels(building);
    expect(store.orphanedRooms()).toEqual([]);
    const att = store.putFile(PNG, "image/png");
    store.create({ channelId: 2, kind: "text", text: "a", authorHash: A, authorName: "Anna" });
    store.create({ channelId: 3, kind: "image", text: "", attachmentId: att.id, attachmentName: "a.png", authorHash: A, authorName: "Anna" });
    store.create({ channelId: 3, kind: "text", text: "b", authorHash: A, authorName: "Anna" });
    store.create({ channelId: 5, kind: "text", text: "c", authorHash: A, authorName: "Anna" });
    store.create({ channelId: 9, kind: "text", text: "from before the places were known", authorHash: A, authorName: "Anna" });
    expect(store.roomStats(3)).toEqual({ posts: 2, bytes: PNG.length });
    // Lab is deleted, the whole 2nd floor too; Office is renamed
    now = 5;
    store.syncChannels(places([0, null, "Root"], [1, 0, "1F"], [2, 1, "Office 1"]));
    expect(store.orphanedRooms()).toEqual([
      { channelId: 5, floorId: 4, name: "Archive", posts: 1, bytes: 0, goneSince: 5 },
      { channelId: 3, floorId: 1, name: "Lab", posts: 2, bytes: PNG.length, goneSince: 5 },
      { channelId: 9, floorId: null, name: "", posts: 1, bytes: 0, goneSince: 5 },
    ]);
    expect(store.placeName(4)).toBe("2F");
    expect(store.placeName(2)).toBe("Office 1");
    // existing rooms are never removed this way
    expect(store.removeRooms([2, 3])).toBe(2);
    expect(store.roomStats(2).posts).toBe(1);
    expect(store.attachment(att.id)).toBeNull();
    expect(store.placeName(3)).toBe(""); // forgotten with its data
    expect(store.removeRooms([5])).toBe(1);
    expect(store.placeName(4)).toBe(""); // its floor holds nothing any more
    expect(store.clearRoom(2)).toBe(1);
    expect(store.orphanedRooms().map((r) => r.channelId)).toEqual([9]);
  });

  it("care: a room moved out of the floor plan keeps its last floor", () => {
    const { store } = tempStore();
    store.syncChannels(places([0, null, "Root"], [1, 0, "1F"], [2, 1, "Office"], [3, 1, "Lab"]));
    store.create({ channelId: 3, kind: "text", text: "x", authorHash: A, authorName: "Anna" });
    store.syncChannels(places([0, null, "Root"], [1, 0, "1F"], [2, 1, "Office"], [3, 2, "Lab"])); // now below Office
    expect(store.orphanedRooms()).toEqual([{ channelId: 3, floorId: 1, name: "Lab", posts: 1, bytes: 0, goneSince: null }]);
  });

  it("migration 3 keeps existing reactions and allows the new kinds", () => {
    const dir = mkdtempSync(join(tmpdir(), "ruumble-board-"));
    const old = new Database(join(dir, "board.sqlite"));
    old.exec(MIGRATIONS[0]!);
    old.exec(MIGRATIONS[1]!);
    old.pragma("user_version = 2");
    old.exec("INSERT INTO posts VALUES ('p1', 3, 'text', 'x', NULL, NULL, NULL, 'h', 'Anna', 1, 1, NULL)");
    old.exec("INSERT INTO reactions VALUES ('p1', 'agree', 'h', 'Anna', 1)");
    expect(() => old.exec("INSERT INTO reactions VALUES ('p1', 'birthday', 'h', 'Anna', 2)")).toThrow(/CHECK/);
    old.close();
    const store = new BoardStore(dir);
    expect(store.get("p1")?.reactions).toEqual([{ kind: "agree", authorHash: "h", authorName: "Anna" }]);
    store.react("p1", "birthday", true, { hash: "h", name: "Anna" });
    expect(store.get("p1")?.reactions.map((r) => r.kind)).toEqual(["agree", "birthday"]);
    store.delete("p1"); // cascade still in place after the rebuild
    expect(store.react("p1", "agree", true, { hash: "h", name: "Anna" })).toBe(false);
  });

  it("migration is repeatable, backup contains database and attachments", async () => {
    const { store, dir } = tempStore();
    const att = store.putFile(PNG, "image/png");
    store.create({ channelId: 3, kind: "image", text: "", attachmentId: att.id, attachmentName: "b.png", authorHash: A, authorName: "Anna" });
    const target = mkdtempSync(join(tmpdir(), "ruumble-backup-"));
    await store.backup(target);
    store.close();
    const restored = new BoardStore(target);
    expect(restored.list(3)).toHaveLength(1);
    expect(existsSync(restored.filePath(att.id))).toBe(true);
    restored.close();
    expect(new BoardStore(dir).list(3)).toHaveLength(1); // reopening: migration does not apply twice
  });
});

describe("REST /api/board", () => {
  async function setup() {
    const source = new FakeSource();
    // floor 1 with room 2 (Anna and Ben should be there), corridor = channel 1
    source.users[0]!.channel = 2;
    source.users[1]!.channel = 2;
    source.admins.add(8);
    const { store } = tempStore();
    const hub = new Hub({ source, pairing: new Pairing(null), publicUrl: "http://r", addressCheck: "off", preview: false });
    const poller = new Poller(source, { onChange: (s) => hub.setState(s) });
    await poller.poll();
    const plugins = { anna: recorder<BridgeToPlugin>(), ben: recorder<BridgeToPlugin>() };
    for (const [session, hash, rec] of [[7, A, plugins.anna], [8, B, plugins.ben]] as const) {
      await hub.pluginConnected(rec.conn, "x").onMessage(JSON.stringify({ v: 1, type: "hello", session, certHash: hash, pluginVersion: "0", paired: true }));
    }
    const notified: string[] = [];
    const app = Fastify();
    await app.register(boardRoutes, {
      store, hub, source,
      certHashOf: (c) => (c === "anna" ? A : c === "ben" ? B : c === "stranger" ? "c".repeat(40) : null),
      onNewPost: (p) => notified.push(p.id),
      writesPerMinute: 5,
    });
    const as = (cookie: string) => ({ cookie });
    return { app, store, hub, source, poller, notified, as, plugins };
  }

  it("without pairing 401, plugin not connected 401, in the corridor 404, in a room 200", async () => {
    const { app, source, poller, as } = await setup();
    expect((await app.inject({ url: "/api/board" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/board", headers: as("stranger") })).statusCode).toBe(401);
    const ok = await app.inject({ url: "/api/board", headers: as("anna") });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ channelId: 2, channelName: "Office", posts: [] });
    source.users[0]!.channel = 1; // Anna goes to the corridor
    await poller.poll();
    expect((await app.inject({ url: "/api/board", headers: as("anna") })).json()).toEqual({ error: "no-board-here" });
  });

  it("pin, view, edit (everyone present), delete (author or admin)", async () => {
    const { app, notified, as } = await setup();
    const created = await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "**Hello**" } });
    expect(created.statusCode).toBe(201);
    const post = created.json();
    expect(post).toMatchObject({ kind: "text", text: "**Hello**", authorName: "Anna", mine: true, canDelete: true });
    expect(notified).toEqual([post.id]);
    // Ben sees it, may edit, is admin → may delete
    const benView = (await app.inject({ url: "/api/board", headers: as("ben") })).json();
    expect(benView.posts[0]).toMatchObject({ id: post.id, mine: false, canDelete: true });
    const edited = await app.inject({ method: "PATCH", url: `/api/board/posts/${post.id}`, headers: as("ben"), payload: { text: "changed" } });
    expect(edited.json()).toMatchObject({ text: "changed", updatedByName: "Ben" });
    expect((await app.inject({ method: "DELETE", url: `/api/board/posts/${post.id}`, headers: as("ben") })).statusCode).toBe(204);
  });

  it("reactions: set and take back, aggregated per kind, no notice, others reload (A1)", async () => {
    const { app, notified, as, hub } = await setup();
    const post = (await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "x" } })).json();
    notified.length = 0;
    const annaUi = recorder<BridgeToUi>();
    hub.uiConnected(annaUi.conn, A);
    const url = (kind: string) => `/api/board/posts/${post.id}/reactions/${kind}`;
    expect((await app.inject({ method: "PUT", url: url("agree"), headers: as("ben") })).json().reactions).toEqual([{ kind: "agree", count: 1, names: ["Ben"], mine: true }]);
    await app.inject({ method: "PUT", url: url("unclear"), headers: as("anna") });
    const view = (await app.inject({ method: "PUT", url: url("agree"), headers: as("anna") })).json();
    expect(view.reactions).toEqual([
      { kind: "agree", count: 2, names: ["Ben", "Anna"], mine: true },
      { kind: "unclear", count: 1, names: ["Anna"], mine: true },
    ]);
    expect(view.updatedByName).toBeUndefined();
    expect(annaUi.last("board")).toEqual({ v: 1, type: "board", channelId: 2 });
    expect(notified).toEqual([]);
    const taken = (await app.inject({ method: "DELETE", url: url("agree"), headers: as("ben") })).json();
    expect(taken.reactions[0]).toEqual({ kind: "agree", count: 1, names: ["Anna"], mine: false });
    expect((await app.inject({ method: "PUT", url: url("love"), headers: as("ben") })).json()).toEqual({ error: "invalid" });
    // work kinds come before social ones, whatever the order of setting them
    await app.inject({ method: "PUT", url: url("cheers"), headers: as("ben") });
    await app.inject({ method: "PUT", url: url("disagree"), headers: as("ben") });
    expect((await app.inject({ url: "/api/board", headers: as("ben") })).json().posts[0].reactions.map((r: { kind: string }) => r.kind)).toEqual(["agree", "disagree", "unclear", "cheers"]);
    expect((await app.inject({ method: "PUT", url: "/api/board/posts/nope/reactions/agree", headers: as("ben") })).json()).toEqual({ error: "not-found" });
    expect((await app.inject({ method: "PUT", url: url("agree") })).statusCode).toBe(401);
  });

  it("task lists: tick exactly one line, counts as an edit, no notice; not a task list → invalid (A2)", async () => {
    const { app, notified, as, hub } = await setup();
    const text = "Release:\n\n- [ ] Tag\n- [ ] Deploy";
    const post = (await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text } })).json();
    notified.length = 0;
    const annaUi = recorder<BridgeToUi>();
    hub.uiConnected(annaUi.conn, A);
    const tick = (who: string, index: number | string, done: unknown) =>
      app.inject({ method: "PUT", url: `/api/board/posts/${post.id}/tasks/${index}`, headers: as(who), payload: { done } });
    // Ben and Anna tick different tasks one after the other: both ticks survive
    await tick("ben", 1, true);
    const both = (await tick("anna", 0, true)).json();
    expect(both.text).toBe("Release:\n\n- [x] Tag\n- [x] Deploy");
    expect(both.updatedByName).toBe("Anna");
    expect(annaUi.last("board")).toEqual({ v: 1, type: "board", channelId: 2 });
    expect(notified).toEqual([]);
    // the same state again: no edit
    expect((await tick("ben", 0, true)).json().updatedByName).toBe("Anna");
    expect((await tick("ben", 1, false)).json().text).toBe("Release:\n\n- [x] Tag\n- [ ] Deploy");
    expect((await tick("ben", 2, true)).json()).toEqual({ error: "invalid" }); // no such task
    expect((await tick("ben", "x", true)).json()).toEqual({ error: "invalid" });
    expect((await tick("ben", 0, "yes")).json()).toEqual({ error: "invalid" });
    const plain = (await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "- [ ] a\nno list" } })).json();
    expect((await app.inject({ method: "PUT", url: `/api/board/posts/${plain.id}/tasks/0`, headers: as("ben"), payload: { done: true } })).json()).toEqual({ error: "invalid" });
  });

  it("kept on top: in the board view, everyone present may set and remove it, only posts of the room (A3)", async () => {
    const { app, as, hub, source, poller } = await setup();
    const post = (await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "- [ ] a" } })).json();
    expect((await app.inject({ url: "/api/board", headers: as("ben") })).json().pinned).toBeNull();
    const annaUi = recorder<BridgeToUi>();
    hub.uiConnected(annaUi.conn, A);
    const pinned = await app.inject({ method: "PUT", url: "/api/board/pin", headers: as("ben"), payload: { postId: post.id, title: "  Checklist  " } });
    expect(pinned.json()).toMatchObject({ postId: post.id, title: "Checklist", pinnedByName: "Ben" });
    expect(annaUi.last("board")).toEqual({ v: 1, type: "board", channelId: 2 });
    expect((await app.inject({ url: "/api/board", headers: as("anna") })).json().pinned).toMatchObject({ postId: post.id, title: "Checklist" });
    expect((await app.inject({ method: "PUT", url: "/api/board/pin", headers: as("ben"), payload: { postId: post.id, title: "x".repeat(41) } })).json()).toEqual({ error: "invalid" });
    expect((await app.inject({ method: "PUT", url: "/api/board/pin", headers: as("ben"), payload: { postId: post.id, title: "   " } })).json()).toEqual({ error: "invalid" });
    expect((await app.inject({ method: "PUT", url: "/api/board/pin", headers: as("ben"), payload: { postId: "nope", title: "x" } })).json()).toEqual({ error: "not-found" });
    expect((await app.inject({ method: "DELETE", url: "/api/board/pin", headers: as("anna") })).statusCode).toBe(204);
    expect((await app.inject({ url: "/api/board", headers: as("ben") })).json().pinned).toBeNull();
    // a post of another room cannot be put on top here
    source.channels.push({ id: 4, parent: 1, name: "Other", position: 2, links: [], temporary: false });
    source.users[1]!.channel = 4;
    await poller.poll();
    expect((await app.inject({ method: "PUT", url: "/api/board/pin", headers: as("ben"), payload: { postId: post.id, title: "x" } })).json()).toEqual({ error: "not-found" });
    expect((await app.inject({ method: "DELETE", url: "/api/board/pin" })).statusCode).toBe(401);
  });

  it("ticket links: only projects mentioned in the room, learned from any room", async () => {
    const { app, source, poller, as } = await setup();
    source.channels.push({ id: 4, parent: 1, name: "Other", position: 2, links: [], temporary: false });
    source.users[1]!.channel = 4;
    await poller.poll();
    await app.inject({ method: "POST", url: "/api/board/posts", headers: as("ben"), payload: { kind: "text", text: "https://jira.example/browse/TAG-1 https://jira.example/browse/SECRET-1" } });
    expect((await app.inject({ url: "/api/board", headers: as("anna") })).json().tickets).toEqual({});
    await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "TAG-1366 is fixed" } });
    expect((await app.inject({ url: "/api/board", headers: as("anna") })).json().tickets).toEqual({ TAG: "https://jira.example/browse/" });
  });

  it("copy to another room: only rooms the user may enter, with origin, notice there, ticks kept, reactions not", async () => {
    const { app, as, hub, plugins, poller, source, store, notified } = await setup();
    source.channels.push({ id: 4, parent: 1, name: "Meeting", position: 2, links: [], temporary: false }, { id: 6, parent: 1, name: "Temp", position: 3, links: [], temporary: true });
    poller.watchSessions([7, 8]);
    await poller.poll();
    const post = (await app.inject({ method: "POST", url: "/api/board/posts", headers: as("ben"), payload: { kind: "text", text: "- [x] one\n- [ ] two" } })).json();
    await app.inject({ method: "PUT", url: `/api/board/posts/${post.id}/reactions/agree`, headers: as("anna") });
    const copy = (target: number, who = "anna", id = post.id) => app.inject({ method: "POST", url: `/api/board/posts/${id}/copy`, headers: as(who), payload: { channelId: target } });
    // Anna may not enter "Secret" (3); the own room, the corridor and temporary rooms have no board to copy to
    expect((await copy(3)).json()).toEqual({ error: "forbidden" });
    for (const target of [2, 1, 6, 99]) expect((await copy(target)).json()).toEqual({ error: "no-board-here" });
    expect((await copy(4, "anna", "nope")).json()).toEqual({ error: "not-found" });
    expect((await app.inject({ method: "POST", url: `/api/board/posts/${post.id}/copy`, headers: as("anna"), payload: { channelId: "4" } })).json()).toEqual({ error: "invalid" });

    const annaUi = recorder<BridgeToUi>();
    hub.uiConnected(annaUi.conn, A);
    source.users[1]!.channel = 4; // Ben is in the meeting room, Anna copies Ben's post there
    await poller.poll();
    const res = await copy(4);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ channelId: 4, text: "- [x] one\n- [ ] two", authorName: "Anna", mine: true, reactions: [], copiedFrom: { roomName: "Office", authorName: "Ben" } });
    expect(notified.at(-1)).toBe(res.json().id);
    notifyRoom(hub, store.get(res.json().id)!, { name: "Anna", certHash: A });
    expect(plugins.ben.last("notify")).toEqual({ v: 1, type: "notify", text: 'Anna hat einen Text aus „Office“ an die Pinnwand geheftet.' });
    expect(annaUi.last("board")).toBeUndefined(); // Anna stays in her room, its board did not change
    expect(store.list(2)).toHaveLength(1);
    // Ben copies the copy back: the original author stays Ben, the room is where it came from now
    const back = (await copy(2, "ben", res.json().id)).json();
    expect(back.copiedFrom).toEqual({ roomName: "Meeting", authorName: "Ben" });
    expect(annaUi.last("board")).toEqual({ v: 1, type: "board", channelId: 2 });
    // posts of another room cannot be copied
    expect((await copy(2, "anna", res.json().id)).json()).toEqual({ error: "not-in-room" });
  });

  it("copy keeps the attachment, stored once", async () => {
    const { app, as, poller, source, store } = await setup();
    source.channels.push({ id: 4, parent: 1, name: "Meeting", position: 2, links: [], temporary: false });
    await poller.poll();
    const img = (await app.inject({ method: "POST", url: "/api/board/uploads", headers: { ...as("anna"), "content-type": "application/octet-stream" }, payload: PNG })).json();
    const post = (await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "image", text: "Sketch", attachmentId: img.id, attachmentName: "a.png" } })).json();
    const copy = (await app.inject({ method: "POST", url: `/api/board/posts/${post.id}/copy`, headers: as("anna"), payload: { channelId: 4 } })).json();
    expect(copy).toMatchObject({ kind: "image", text: "Sketch", attachment: { id: img.id, name: "a.png" } });
    // deleting the original keeps the file for the copy
    await app.inject({ method: "DELETE", url: `/api/board/posts/${post.id}`, headers: as("anna") });
    expect(existsSync(store.filePath(img.id))).toBe(true);
  });

  it("non-admin may not delete other people's posts", async () => {
    const { app, source, as } = await setup();
    source.admins.clear();
    const post = (await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "x" } })).json();
    expect((await app.inject({ method: "DELETE", url: `/api/board/posts/${post.id}`, headers: as("ben") })).json()).toEqual({ error: "forbidden" });
  });

  it("posts of other rooms are unreachable", async () => {
    const { app, source, poller, as } = await setup();
    const post = (await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "x" } })).json();
    source.channels.push({ id: 4, parent: 1, name: "Other", position: 2, links: [], temporary: false });
    source.users[1]!.channel = 4;
    await poller.poll();
    expect((await app.inject({ url: "/api/board", headers: as("ben") })).json().posts).toEqual([]);
    expect((await app.inject({ method: "PATCH", url: `/api/board/posts/${post.id}`, headers: as("ben"), payload: { text: "y" } })).json()).toEqual({ error: "not-in-room" });
    expect((await app.inject({ method: "PUT", url: `/api/board/posts/${post.id}/reactions/agree`, headers: as("ben") })).json()).toEqual({ error: "not-in-room" });
  });

  it("temporary channels have no board", async () => {
    const { app, source, poller, as } = await setup();
    source.channels.push({ id: 6, parent: 1, name: "Temp", position: 3, links: [], temporary: true });
    source.users[0]!.channel = 6;
    await poller.poll();
    expect((await app.inject({ url: "/api/board", headers: as("anna") })).statusCode).toBe(404);
  });

  it("upload: image type from the bytes, SVG never as image, size limit, file as download", async () => {
    const { app, as } = await setup();
    const img = await app.inject({ method: "POST", url: "/api/board/uploads", headers: { ...as("anna"), "content-type": "application/octet-stream" }, payload: PNG });
    expect(img.json()).toMatchObject({ mime: "image/png", width: 64, height: 32, image: true });
    const svg = await app.inject({ method: "POST", url: "/api/board/uploads", headers: { ...as("anna"), "content-type": "image/svg+xml" }, payload: Buffer.from("<svg onload=alert(1)>") });
    expect(svg.json()).toMatchObject({ mime: "application/octet-stream", image: false });
    const big = await app.inject({ method: "POST", url: "/api/board/uploads", headers: { ...as("anna"), "content-type": "application/octet-stream" }, payload: Buffer.alloc(10 * 1024 * 1024 + 1) });
    expect(big.statusCode).toBe(413);
    // pin SVG as "image" → rejected; as file → download
    const svgId = svg.json().id;
    expect((await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "image", text: "", attachmentId: svgId } })).json()).toEqual({ error: "bad-type" });
    await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "file", text: "", attachmentId: svgId, attachmentName: "x.svg" } });
    const file = await app.inject({ url: `/api/board/files/${svgId}`, headers: as("anna") });
    expect(file.headers["content-disposition"]).toMatch(/^attachment;/);
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    const imgPost = await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "image", text: "Image", attachmentId: img.json().id, attachmentName: "b.png" } });
    expect((await app.inject({ url: `/api/board/files/${imgPost.json().attachment.id}`, headers: as("anna") })).headers["content-disposition"]).toMatch(/^inline;/);
  });

  it("upload: JSON and text arrive as raw data, the type is in X-File-Type", async () => {
    const { app, as } = await setup();
    const json = await app.inject({ method: "POST", url: "/api/board/uploads", headers: { ...as("anna"), "content-type": "application/octet-stream", "x-file-type": "application/json", "x-file-name": "data.json" }, payload: Buffer.from('{"a":1}') });
    expect(json.statusCode).toBe(201);
    expect(json.json()).toMatchObject({ mime: "application/json", size: 7, name: "data.json", image: false });
  });

  it("notice in the Mumble log (German default): short, with type, to the others present, not to the author", async () => {
    const { hub, plugins, source, poller } = await setup();
    expect(notifyText("Ben", "code")).toBe("Ben hat Code an die Pinnwand geheftet.");
    expect(["text", "image", "file"].map((k) => notifyText("Anna", k as PostKind))).toEqual([
      "Anna hat einen Text an die Pinnwand geheftet.",
      "Anna hat ein Bild an die Pinnwand geheftet.",
      "Anna hat eine Datei an die Pinnwand geheftet.",
    ]);
    expect(notifyRoom(hub, { channelId: 2, kind: "image" }, { name: "Anna", certHash: A })).toBe(1);
    expect(plugins.ben.last("notify")).toEqual({ v: 1, type: "notify", text: "Anna hat ein Bild an die Pinnwand geheftet." });
    expect(plugins.anna.last("notify")).toBeUndefined();
    source.users[1]!.channel = 1; // Ben goes to the corridor: no more notice
    await poller.poll();
    expect(notifyRoom(hub, { channelId: 2, kind: "text" }, { name: "Anna", certHash: A })).toBe(0);
  });

  it("notice for a copy names the room it came from", () => {
    expect(notifyText("Anna", "code", "de", "Meeting")).toBe("Anna hat Code aus „Meeting“ an die Pinnwand geheftet.");
    expect(notifyText("Anna", "image", "en", "Meeting")).toBe('Anna brought an image from "Meeting" to the board.');
  });

  it("notice in the recipient's language (plugin reports locale)", async () => {
    const { hub } = await setup();
    expect(["text", "code", "image", "file"].map((k) => notifyText("Anna", k as PostKind, "en"))).toEqual([
      "Anna pinned a text to the board.",
      "Anna pinned code to the board.",
      "Anna pinned an image to the board.",
      "Anna pinned a file to the board.",
    ]);
    const benEn = recorder<BridgeToPlugin>();
    await hub.pluginConnected(benEn.conn, "x").onMessage(JSON.stringify({ v: 1, type: "hello", session: 8, certHash: B, pluginVersion: "0.4.0", paired: true, locale: "en" }));
    notifyRoom(hub, { channelId: 2, kind: "code" }, { name: "Anna", certHash: A });
    expect(benEn.last("notify")?.text).toBe("Anna pinned code to the board.");
  });

  it("invalid input, rate limit", async () => {
    const { app, as } = await setup();
    expect((await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "  " } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "video", text: "x" } })).statusCode).toBe(400);
    for (let i = 0; i < 5; i++) await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: `t${i}` } });
    expect((await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "too many" } })).statusCode).toBe(429);
  });

  it("web UIs in the room get \"board\", the snapshot reveals nothing about posts", async () => {
    const { app, hub, as } = await setup();
    const uiAnna = recorder<BridgeToUi>();
    hub.uiConnected(uiAnna.conn, A);
    await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "x" } });
    expect(uiAnna.last("board")).toEqual({ v: 1, type: "board", channelId: 2 });
    expect(uiAnna.last("snapshot")).not.toHaveProperty("boards");
  });
});

describe("REST /api/care (ADR-0014)", () => {
  async function setup() {
    const source = new FakeSource();
    source.users[0]!.channel = 2; // Anna in Office, Ben (admin) in the corridor
    source.admins.add(8);
    const { store } = tempStore({ orphanMinutes: 0 });
    const hub = new Hub({ source, pairing: new Pairing(null), publicUrl: "http://r", addressCheck: "off", preview: false });
    const poller = new Poller(source, { onChange: (s) => { store.syncChannels(s.channels); hub.setState(s); } });
    await poller.poll();
    const plugins = { anna: recorder<BridgeToPlugin>(), ben: recorder<BridgeToPlugin>() };
    for (const [session, hash, rec] of [[7, A, plugins.anna], [8, B, plugins.ben]] as const) {
      await hub.pluginConnected(rec.conn, "x").onMessage(JSON.stringify({ v: 1, type: "hello", session, certHash: hash, pluginVersion: "0", paired: true }));
    }
    const app = Fastify();
    await app.register(careRoutes, {
      store, hub, source,
      certHashOf: (c) => (c === "anna" ? A : c === "ben" ? B : null),
      onCleared: (id, viewer) => notifyCleared(hub, id, viewer),
      actionsPerMinute: 4,
    });
    const as = (cookie: string) => ({ cookie });
    return { app, store, hub, source, poller, plugins, as };
  }

  it("the snapshot names the channels the user may tend: root, floors, rooms", async () => {
    const { hub, poller } = await setup();
    poller.watchSessions([7, 8]); // main.ts: onSessionsChanged
    await poller.poll();
    const ben = recorder<BridgeToUi>(), anna = recorder<BridgeToUi>();
    hub.uiConnected(ben.conn, B);
    hub.uiConnected(anna.conn, A);
    expect(ben.last("snapshot")?.care).toEqual([0, 1, 2, 3]);
    expect(anna.last("snapshot")?.care).toEqual([]);
    expect(poller.state?.care.get(8)).toEqual([0, 1, 2, 3]);
  });

  it("room: only with Write permission, from anywhere; clear the board with a notice to those present", async () => {
    const { app, store, hub, plugins, as } = await setup();
    store.create({ channelId: 2, kind: "text", text: "see TAG-2", authorHash: A, authorName: "Anna" });
    expect((await app.inject({ url: "/api/care/rooms/2" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/care/rooms/2", headers: as("anna") })).json()).toEqual({ error: "forbidden" });
    expect((await app.inject({ url: "/api/care/rooms/1", headers: as("ben") })).json()).toEqual({ error: "not-found" }); // a floor
    expect((await app.inject({ url: "/api/care/rooms/2", headers: as("ben") })).json()).toEqual({ channelId: 2, name: "Office", posts: 1, bytes: 0 });
    const ui = recorder<BridgeToUi>();
    hub.uiConnected(ui.conn, A);
    expect((await app.inject({ method: "DELETE", url: "/api/care/rooms/2/posts", headers: as("anna") })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: "/api/care/rooms/2/posts", headers: as("ben") })).json()).toEqual({ posts: 1 });
    expect(store.list(2)).toEqual([]);
    expect(ui.last("board")).toEqual({ v: 1, type: "board", channelId: 2 });
    expect(plugins.anna.last("notify")?.text).toBe("Ben hat die Pinnwand geleert.");
    expect(clearedText("Ben", "en")).toBe("Ben cleared the board.");
  });

  it("building: every learned ticket link, forgotten per project for the whole building", async () => {
    const { app, store, as } = await setup();
    store.create({ channelId: 3, kind: "text", text: "https://wrong.example/browse/TAG-1 https://jira.example/browse/VKB-1", authorHash: A, authorName: "Anna" });
    store.create({ channelId: 2, kind: "text", text: "TAG-7", authorHash: A, authorName: "Anna" });
    expect((await app.inject({ url: "/api/care/building", headers: as("ben") })).json().tickets).toEqual({ TAG: "https://wrong.example/browse/", VKB: "https://jira.example/browse/" });
    const forget = (who: string, projects: unknown) => app.inject({ method: "POST", url: "/api/care/building/tickets/forget", headers: as(who), payload: { projects } });
    expect((await forget("anna", ["TAG"])).statusCode).toBe(403);
    expect((await forget("ben", [])).statusCode).toBe(400);
    expect((await forget("ben", ["TAG", "NOPE"])).statusCode).toBe(204);
    expect(store.ticketLinks()).toEqual({ VKB: "https://jira.example/browse/" });
  });

  it("floor and building: list what is gone, remove only what is still gone", async () => {
    const { app, store, source, poller, as } = await setup();
    source.channels.push(
      { id: 4, parent: 0, name: "2F", position: 1, links: [], temporary: false },
      { id: 5, parent: 4, name: "Archive", position: 0, links: [], temporary: false },
    );
    await poller.poll();
    for (const id of [2, 3, 5]) store.create({ channelId: id, kind: "text", text: `in ${id}`, authorHash: A, authorName: "Anna" });
    source.channels = source.channels.filter((c) => c.id !== 3 && c.id !== 4 && c.id !== 5); // Secret and the 2nd floor are deleted
    await poller.poll();
    expect((await app.inject({ url: "/api/care/floors/2", headers: as("ben") })).json()).toEqual({ error: "not-found" }); // a room
    expect((await app.inject({ url: "/api/care/floors/1", headers: as("anna") })).statusCode).toBe(403);
    const floor = (await app.inject({ url: "/api/care/floors/1", headers: as("ben") })).json();
    expect(floor).toMatchObject({ channelId: 1, name: "1F", orphans: [{ channelId: 3, name: "Secret", posts: 1, bytes: 0 }] });
    expect(floor.orphans[0].goneSince).toEqual(expect.any(Number));
    const building = (await app.inject({ url: "/api/care/building", headers: as("ben") })).json();
    expect(building).toMatchObject({ orphans: [{ channelId: 4, name: "2F", rooms: 1, posts: 1, bytes: 0 }] });
    // the existing room 2 and the other floor's room 5 are not touched from floor 1
    expect((await app.inject({ method: "POST", url: "/api/care/floors/1/cleanup", headers: as("ben"), payload: { rooms: [2, 3, 5] } })).json()).toEqual({ posts: 1 });
    expect(store.channelsWithPosts()).toEqual([2, 5]);
    expect((await app.inject({ method: "POST", url: "/api/care/building/cleanup", headers: as("ben"), payload: { floors: [] } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/care/building/cleanup", headers: as("ben"), payload: { floors: [4, 1] } })).json()).toEqual({ posts: 1 });
    expect(store.channelsWithPosts()).toEqual([2]);
    expect((await app.inject({ url: "/api/care/building", headers: as("ben") })).json()).toEqual({ orphans: [], tickets: {} });
    expect((await app.inject({ method: "POST", url: "/api/care/building/cleanup", headers: as("anna"), payload: { floors: [4] } })).statusCode).toBe(403);
  });

  it("orphaned floors: grouped by last floor, unknown floor as null, earliest date", () => {
    const room = (channelId: number, floorId: number | null, goneSince: number | null) => ({ channelId, floorId, name: "", posts: 2, bytes: 10, goneSince });
    expect(orphanedFloors([room(1, 9, 50), room(2, 9, 20), room(3, null, null), room(4, 1, 5)], (id) => id === 1, (id) => `F${id}`)).toEqual([
      { channelId: 9, name: "F9", rooms: 2, posts: 4, bytes: 20, goneSince: 20 },
      { channelId: null, name: "", rooms: 1, posts: 2, bytes: 10, goneSince: null },
    ]);
  });

  it("rate limit and invalid ids", async () => {
    const { app, as } = await setup();
    expect((await app.inject({ url: "/api/care/rooms/x", headers: as("ben") })).statusCode).toBe(404);
    for (let i = 0; i < 4; i++) await app.inject({ method: "DELETE", url: "/api/care/rooms/2/posts", headers: as("ben") });
    expect((await app.inject({ method: "DELETE", url: "/api/care/rooms/2/posts", headers: as("ben") })).statusCode).toBe(429);
    expect((await app.inject({ method: "POST", url: "/api/care/floors/1/cleanup", headers: as("ben"), payload: { rooms: "all" } })).statusCode).toBe(400);
  });
});
