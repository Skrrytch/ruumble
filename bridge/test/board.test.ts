import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { BridgeToPlugin, BridgeToUi, PostKind } from "@ruumble/protocol";
import { imageSize, safeFileName } from "../src/board/media.ts";
import { notifyRoom, notifyText } from "../src/board/notify.ts";
import { boardRoutes } from "../src/board/routes.ts";
import { BoardStore } from "../src/board/store.ts";
import { Hub } from "../src/hub.ts";
import { Pairing } from "../src/pairing.ts";
import { Poller } from "../src/poller.ts";
import { FakeSource, recorder } from "./fake.ts";

const DAY = 24 * 60 * 60 * 1000;
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000040000000200806000000", "hex"); // 64×32
const A = "a".repeat(40), B = "b".repeat(40);

const tempStore = (opts: ConstructorParameters<typeof BoardStore>[1] = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "ruumble-board-"));
  return { store: new BoardStore(dir, opts), dir };
};

describe("media", () => {
  it("liest Bildmaße aus dem Dateikopf", () => {
    expect(imageSize(PNG, "image/png")).toEqual({ width: 64, height: 32 });
    expect(imageSize(Buffer.from("GIF89a\x10\x00\x08\x00", "latin1"), "image/gif")).toEqual({ width: 16, height: 8 });
    expect(imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 20, 0, 40, 3]), "image/jpeg")).toEqual({ width: 40, height: 20 });
    expect(imageSize(Buffer.alloc(4), "image/png")).toBeNull();
  });

  it("bereinigt Dateinamen", () => {
    expect(safeFileName("..%2F..%2Fetc%2Fpasswd")).toBe(".._.._etc_passwd");
    expect(safeFileName(encodeURIComponent("Bericht (final).pdf"))).toBe("Bericht (final).pdf");
    expect(safeFileName(undefined)).toBe("datei");
    expect(safeFileName("%E0%A4%A")).toBe("%E0%A4%A"); // broken encoding → raw
  });
});

describe("BoardStore", () => {
  it("legt an, listet neueste zuerst, bearbeitet und löscht", () => {
    const { store } = tempStore();
    const a = store.create({ channelId: 3, kind: "text", text: "erster", authorHash: A, authorName: "Anna" });
    const b = store.create({ channelId: 3, kind: "code", text: "x = 1", language: "python", authorHash: B, authorName: "Ben" });
    store.create({ channelId: 4, kind: "text", text: "anderswo", authorHash: A, authorName: "Anna" });
    expect(store.list(3).map((p) => p.id)).toEqual([b.id, a.id]);
    expect(store.channelsWithPosts()).toEqual([3, 4]);
    expect(store.update(a.id, { text: "geändert" }, "Ben")).toMatchObject({ text: "geändert", updatedByName: "Ben" });
    expect(store.delete(a.id)).toBe(true);
    expect(store.delete(a.id)).toBe(false);
    expect(store.get(b.id)?.language).toBe("python");
  });

  it("Anhänge: ein Inhalt nur einmal, verwaiste werden entfernt", () => {
    const { store } = tempStore({ orphanMinutes: 0 });
    const att = store.putFile(PNG, "image/png", { width: 64, height: 32 });
    expect(store.putFile(PNG, "image/png").id).toBe(att.id);
    const p = store.create({ channelId: 3, kind: "image", text: "", attachmentId: att.id, attachmentName: "bild.png", authorHash: A, authorName: "Anna" });
    expect(store.get(p.id)?.attachment).toMatchObject({ id: att.id, name: "bild.png", mime: "image/png", width: 64 });
    expect(existsSync(store.filePath(att.id))).toBe(true);
    store.delete(p.id);
    expect(store.attachment(att.id)).toBeNull();
    expect(existsSync(store.filePath(att.id))).toBe(false);
  });

  it("Löschen eines Beitrags lässt frische Uploads anderer stehen", () => {
    const { store } = tempStore();
    const mine = store.putFile(PNG, "image/png");
    const p = store.create({ channelId: 3, kind: "image", text: "", attachmentId: mine.id, attachmentName: "a.png", authorHash: A, authorName: "Anna" });
    const pending = store.putFile(Buffer.from("noch nicht angeheftet"), "text/plain"); // Ben is uploading right now
    store.delete(p.id);
    expect(store.attachment(mine.id)).toBeNull();
    expect(store.attachment(pending.id)).not.toBeNull();
    expect(existsSync(store.filePath(pending.id))).toBe(true);
  });

  it("Aufbewahrung 30 Tage und gelöschte Kanäle nach 7 Tagen", () => {
    let now = 1_000 * DAY;
    const { store } = tempStore({ now: () => now });
    store.create({ channelId: 3, kind: "text", text: "alt", authorHash: A, authorName: "Anna" });
    now += 10 * DAY;
    store.create({ channelId: 5, kind: "text", text: "Kanal verschwindet", authorHash: A, authorName: "Anna" });
    store.syncChannels([3]); // channel 5 is gone
    now += 8 * DAY;
    expect(store.cleanup()).toEqual({ removed: 1, channels: [5] }); // channel 5 after 7 days
    now += 13 * DAY; // post in 3 is now 31 days old
    expect(store.cleanup().removed).toBe(1);
    expect(store.channelsWithPosts()).toEqual([]);
  });

  it("wieder aufgetauchter Kanal wird nicht gelöscht", () => {
    let now = 0;
    const { store } = tempStore({ now: () => now });
    store.create({ channelId: 5, kind: "text", text: "x", authorHash: A, authorName: "Anna" });
    store.syncChannels([]);
    now += 3 * DAY;
    store.syncChannels([5]);
    now += 5 * DAY;
    expect(store.cleanup().removed).toBe(0);
  });

  it("Kontingent: älteste Beiträge mit Anhang zuerst", () => {
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

  it("Migration ist wiederholbar, Sicherung enthält Datenbank und Anhänge", async () => {
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
      certHashOf: (c) => (c === "anna" ? A : c === "ben" ? B : c === "fremd" ? "c".repeat(40) : null),
      onNewPost: (p) => notified.push(p.id),
      writesPerMinute: 5,
    });
    const as = (cookie: string) => ({ cookie });
    return { app, store, hub, source, poller, notified, as, plugins };
  }

  it("ohne Kopplung 401, Plugin nicht verbunden 401, im Flur 404, im Raum 200", async () => {
    const { app, source, poller, as } = await setup();
    expect((await app.inject({ url: "/api/board" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/board", headers: as("fremd") })).statusCode).toBe(401);
    const ok = await app.inject({ url: "/api/board", headers: as("anna") });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ channelId: 2, channelName: "Büro", posts: [] });
    source.users[0]!.channel = 1; // Anna goes to the corridor
    await poller.poll();
    expect((await app.inject({ url: "/api/board", headers: as("anna") })).json()).toEqual({ error: "no-board-here" });
  });

  it("anheften, sehen, bearbeiten (alle Anwesenden), löschen (Autor oder Admin)", async () => {
    const { app, notified, as } = await setup();
    const created = await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "**Hallo**" } });
    expect(created.statusCode).toBe(201);
    const post = created.json();
    expect(post).toMatchObject({ kind: "text", text: "**Hallo**", authorName: "Anna", mine: true, canDelete: true });
    expect(notified).toEqual([post.id]);
    // Ben sees it, may edit, is admin → may delete
    const benView = (await app.inject({ url: "/api/board", headers: as("ben") })).json();
    expect(benView.posts[0]).toMatchObject({ id: post.id, mine: false, canDelete: true });
    const edited = await app.inject({ method: "PATCH", url: `/api/board/posts/${post.id}`, headers: as("ben"), payload: { text: "geändert" } });
    expect(edited.json()).toMatchObject({ text: "geändert", updatedByName: "Ben" });
    expect((await app.inject({ method: "DELETE", url: `/api/board/posts/${post.id}`, headers: as("ben") })).statusCode).toBe(204);
  });

  it("Nicht-Admin darf fremde Beiträge nicht löschen", async () => {
    const { app, source, as } = await setup();
    source.admins.clear();
    const post = (await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "x" } })).json();
    expect((await app.inject({ method: "DELETE", url: `/api/board/posts/${post.id}`, headers: as("ben") })).json()).toEqual({ error: "forbidden" });
  });

  it("Beiträge anderer Räume sind unerreichbar", async () => {
    const { app, source, poller, as } = await setup();
    const post = (await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "x" } })).json();
    source.channels.push({ id: 4, parent: 1, name: "Anderer", position: 2, links: [], temporary: false });
    source.users[1]!.channel = 4;
    await poller.poll();
    expect((await app.inject({ url: "/api/board", headers: as("ben") })).json().posts).toEqual([]);
    expect((await app.inject({ method: "PATCH", url: `/api/board/posts/${post.id}`, headers: as("ben"), payload: { text: "y" } })).json()).toEqual({ error: "not-in-room" });
  });

  it("temporäre Kanäle haben keine Pinnwand", async () => {
    const { app, source, poller, as } = await setup();
    source.channels.push({ id: 6, parent: 1, name: "Temp", position: 3, links: [], temporary: true });
    source.users[0]!.channel = 6;
    await poller.poll();
    expect((await app.inject({ url: "/api/board", headers: as("anna") })).statusCode).toBe(404);
  });

  it("Upload: Bildtyp aus den Bytes, SVG nie als Bild, Größengrenze, Datei als Download", async () => {
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
    const imgPost = await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "image", text: "Bild", attachmentId: img.json().id, attachmentName: "b.png" } });
    expect((await app.inject({ url: `/api/board/files/${imgPost.json().attachment.id}`, headers: as("anna") })).headers["content-disposition"]).toMatch(/^inline;/);
  });

  it("Upload: JSON und Text kommen als Rohdaten an, der Typ steht in X-File-Type", async () => {
    const { app, as } = await setup();
    const json = await app.inject({ method: "POST", url: "/api/board/uploads", headers: { ...as("anna"), "content-type": "application/octet-stream", "x-file-type": "application/json", "x-file-name": "daten.json" }, payload: Buffer.from('{"a":1}') });
    expect(json.statusCode).toBe(201);
    expect(json.json()).toMatchObject({ mime: "application/json", size: 7, name: "daten.json", image: false });
  });

  it("Hinweis im Mumble-Protokoll: kurz, mit Typ, an die anderen Anwesenden, nicht an den Autor", async () => {
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

  it("Hinweis in der Sprache des Empfängers (Plugin meldet locale)", async () => {
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

  it("ungültige Eingaben, Rate-Limit", async () => {
    const { app, as } = await setup();
    expect((await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "  " } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "video", text: "x" } })).statusCode).toBe(400);
    for (let i = 0; i < 5; i++) await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: `t${i}` } });
    expect((await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "zu viel" } })).statusCode).toBe(429);
  });

  it("Oberflächen im Raum bekommen „board“, der Snapshot verrät nichts über Beiträge", async () => {
    const { app, hub, as } = await setup();
    const uiAnna = recorder<BridgeToUi>();
    hub.uiConnected(uiAnna.conn, A);
    await app.inject({ method: "POST", url: "/api/board/posts", headers: as("anna"), payload: { kind: "text", text: "x" } });
    expect(uiAnna.last("board")).toEqual({ v: 1, type: "board", channelId: 2 });
    expect(uiAnna.last("snapshot")).not.toHaveProperty("boards");
  });
});
