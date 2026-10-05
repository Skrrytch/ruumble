import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BridgeToPlugin, BridgeToUi, Snapshot } from "@ruumble/protocol";
import { Gate } from "../src/access.ts";
import { Hub } from "../src/hub.ts";
import { Pairing } from "../src/pairing.ts";
import { Poller } from "../src/poller.ts";
import { normalizeStatus, StatusBook, statusRoutes } from "../src/status.ts";
import { FakeSource, recorder } from "./fake.ts";

const A = "a".repeat(40), B = "b".repeat(40);
const MIN = 60_000;

afterEach(() => vi.useRealTimers());

describe("StatusBook (B, ADR-0018)", () => {
  it("set with an expiry, recent texts newest first without duplicates, at most five", () => {
    let now = 1000;
    const book = new StatusBook(null, { now: () => now });
    expect(book.view(A)).toEqual({ current: null, recent: [] });
    expect(book.set(A, "Lunch", 120)).toEqual({ current: { text: "Lunch", until: 1000 + 120 * MIN }, recent: ["Lunch"] });
    for (const t of ["Meeting", "Focus", "Lunch", "Call", "Review", "Travel"]) book.set(A, t, null);
    expect(book.view(A)).toEqual({ current: { text: "Travel", until: null }, recent: ["Travel", "Review", "Call", "Lunch", "Focus"] });
    expect(book.current(B)).toBeNull();
    now = 10 ** 12; // no expiry: stays
    expect(book.current(A)?.text).toBe("Travel");
    book.close();
  });

  it("clear keeps the recent texts; an expired status is gone", () => {
    let now = 0;
    const changes: number[] = [];
    const book = new StatusBook(null, { now: () => now, onChange: () => changes.push(now) });
    book.set(A, "Lunch", 30);
    expect(book.clear(A)).toEqual({ current: null, recent: ["Lunch"] });
    book.clear(A); // nothing to clear: no change
    expect(changes).toEqual([0, 0]);
    book.set(A, "Call", 30);
    now = 30 * MIN;
    expect(book.current(A)).toBeNull();
    expect(book.expire()).toBe(true);
    expect(book.view(A)).toEqual({ current: null, recent: ["Call", "Lunch"] });
    book.close();
  });

  it("the timer removes expired statuses and reports the change", () => {
    vi.useFakeTimers({ now: 0 });
    const changes: number[] = [];
    const book = new StatusBook(null, { onChange: () => changes.push(Date.now()) });
    book.set(A, "Short", 1);
    book.set(B, "Long", 60);
    changes.length = 0;
    vi.advanceTimersByTime(MIN + 100);
    expect(changes).toHaveLength(1);
    expect(book.current(A)).toBeNull();
    expect(book.current(B)?.text).toBe("Long");
    vi.advanceTimersByTime(60 * MIN);
    expect(changes).toHaveLength(2);
    expect(book.current(B)).toBeNull();
    book.close();
  });

  it("is kept in the file and loaded again, expired ones removed", () => {
    const file = join(mkdtempSync(join(tmpdir(), "ruumble-status-")), "statuses.json");
    let now = 0;
    const one = new StatusBook(file, { now: () => now });
    one.set(A, "Lunch", 60);
    one.set(B, "Away", null);
    one.close();
    now = 2 * 60 * MIN;
    const two = new StatusBook(file, { now: () => now });
    expect(two.view(A)).toEqual({ current: null, recent: ["Lunch"] });
    expect(two.current(B)).toEqual({ text: "Away", until: null });
    expect(JSON.parse(readFileSync(file, "utf8"))[A].current).toBeNull();
    two.close();
    const broken = join(mkdtempSync(join(tmpdir(), "ruumble-status-")), "statuses.json");
    expect(new StatusBook(broken).view(A)).toEqual({ current: null, recent: [] }); // missing file
  });

  it("one line with single spaces", () => {
    expect(normalizeStatus("  In a\n meeting\t\u0007until 2  ")).toBe("In a meeting until 2");
  });
});

describe("REST /api/status and the snapshot (B, ADR-0018)", () => {
  async function setup() {
    const source = new FakeSource();
    const pairing = new Pairing(null);
    let hub: Hub;
    const book = new StatusBook(null, { onChange: () => hub.rebroadcast() });
    hub = new Hub({ source, pairing, publicUrl: "http://r", addressCheck: "off", preview: false, statusOf: (h) => book.current(h) });
    const poller = new Poller(source, { onChange: (s) => hub.setState(s) });
    await poller.poll();
    const plugins = Object.fromEntries(
      await Promise.all(
        ([[7, A], [8, B]] as const).map(async ([session, hash]) => {
          const plugin = hub.pluginConnected(recorder<BridgeToPlugin>().conn, "x");
          await plugin.onMessage(JSON.stringify({ v: 1, type: "hello", session, certHash: hash, pluginVersion: "0", paired: true }));
          return [hash, plugin] as const;
        }),
      ),
    );
    const anna = pairing.redeem(pairing.createCode(A, "Anna"))!;
    const app = Fastify();
    await app.register(statusRoutes, { book, gate: new Gate({ hub, source, certHashOf: (cookie) => pairing.certHashOf(cookie) }), writesPerMinute: 3 });
    const ben = recorder<BridgeToUi>();
    hub.uiConnected(ben.conn, B);
    const statusIn = (r: typeof ben, session: number) => (r.last("snapshot") as Snapshot).users.find((u) => u.session === session)?.status;
    return { app, anna, ben, plugins, statusIn, book, hub: hub! };
  }

  it("set, everyone sees it at the person, cleared again", async () => {
    const { app, anna, ben, statusIn, book } = await setup();
    expect((await app.inject({ url: "/api/status" })).statusCode).toBe(401);
    const put = await app.inject({ method: "PUT", url: "/api/status", headers: { cookie: anna }, payload: { text: " Lunch ", minutes: 60 } });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ current: { text: "Lunch" }, recent: ["Lunch"] });
    expect(statusIn(ben, 7)).toEqual(put.json().current);
    expect(statusIn(ben, 8)).toBeUndefined();
    expect((await app.inject({ url: "/api/status", headers: { cookie: anna } })).json()).toEqual(put.json());
    const del = await app.inject({ method: "DELETE", url: "/api/status", headers: { cookie: anna } });
    expect(del.json()).toEqual({ current: null, recent: ["Lunch"] });
    expect(statusIn(ben, 7)).toBeUndefined();
    book.close();
  });

  it("invalid texts and durations, rate limit", async () => {
    const { app, anna, book } = await setup();
    const put = (payload: unknown) => app.inject({ method: "PUT", url: "/api/status", headers: { cookie: anna }, payload: payload as object });
    expect((await put({ text: "  \n ", minutes: 60 })).statusCode).toBe(400);
    expect((await put({ text: "x".repeat(81), minutes: 60 })).statusCode).toBe(400);
    expect((await put({ text: "Lunch", minutes: 0 })).statusCode).toBe(400);
    expect((await put({ text: "Lunch" })).statusCode).toBe(400);
    for (let i = 0; i < 3; i++) expect((await put({ text: `S${i}`, minutes: null })).statusCode).toBe(200);
    expect((await put({ text: "S4", minutes: null })).statusCode).toBe(429);
    book.close();
  });

  it("shown only while the plugin is connected, like \"uses Ruumble\"; everyone learns when it comes back", async () => {
    const { app, anna, ben, plugins, statusIn, book, hub } = await setup();
    await app.inject({ method: "PUT", url: "/api/status", headers: { cookie: anna }, payload: { text: "Lunch", minutes: null } });
    const user = (session: number) => (ben.last("snapshot") as Snapshot).users.find((u) => u.session === session);
    expect(user(7)?.ruumble).toBe(true); // uses Ruumble: plugin connected
    plugins[A]!.onClose();
    expect(statusIn(ben, 7)).toBeUndefined();
    expect(user(7)?.ruumble).toBeUndefined();
    await hub.pluginConnected(recorder<BridgeToPlugin>().conn, "x").onMessage(JSON.stringify({ v: 1, type: "hello", session: 7, certHash: A, pluginVersion: "0", paired: true }));
    expect(statusIn(ben, 7)).toEqual({ text: "Lunch", until: null });
    expect(user(7)?.ruumble).toBe(true);
    book.close();
  });
});
