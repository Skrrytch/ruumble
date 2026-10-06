import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { BridgeToPlugin, BridgeToUi } from "@ruumble/protocol";
import { Gate } from "../src/access.ts";
import { Hub } from "../src/hub.ts";
import { nudgeRoutes, nudgeText } from "../src/nudge.ts";
import { Pairing } from "../src/pairing.ts";
import { Poller } from "../src/poller.ts";
import { FakeSource, recorder } from "./fake.ts";

const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40);

describe("nudge (ADR-0020)", () => {
  /** Anna (7) and Ben (8) in the office, Ben deafened; Clara (9) on the floor; everyone with a plugin */
  async function setup(o: { benDeaf?: "self" | "server" | false; benPlugin?: boolean } = {}) {
    const source = new FakeSource();
    source.users[0]!.channel = 2;
    if (o.benDeaf === "self") source.users[1]!.selfDeaf = true;
    if (o.benDeaf === "server") source.users[1]!.deaf = true;
    source.users.push({ ...source.users[0]!, session: 9, name: "Clara", channel: 1, address: "10.0.0.9" });
    source.hashes[9] = C;
    const pairing = new Pairing(null);
    const hub = new Hub({ source, pairing, addressCheck: "off", preview: false });
    await new Poller(source, { onChange: (s) => hub.setState(s) }).poll();
    const plugins: Record<number, ReturnType<typeof recorder<BridgeToPlugin>>> = {};
    for (const [session, hash, locale] of [[7, A, "de"], [8, B, "en"], [9, C, "de"]] as const) {
      if (session === 8 && o.benPlugin === false) continue;
      plugins[session] = recorder<BridgeToPlugin>();
      await hub.pluginConnected(plugins[session].conn, "x").onMessage(JSON.stringify({ v: 1, type: "hello", session, certHash: hash, pluginVersion: "0", paired: true, locale }));
    }
    const ben = recorder<BridgeToUi>();
    const anna = recorder<BridgeToUi>();
    hub.uiConnected(ben.conn, B);
    hub.uiConnected(anna.conn, A);
    const cookie = { anna: pairing.redeem(pairing.createCode(A, "Anna"))!, clara: pairing.redeem(pairing.createCode(C, "Clara"))! };
    const app = Fastify();
    await app.register(nudgeRoutes, { hub, gate: new Gate({ hub, source, certHashOf: (c) => pairing.certHashOf(c) }) });
    const nudge = (who: keyof typeof cookie | null, session: unknown) =>
      app.inject({ method: "POST", url: "/api/nudge", headers: who ? { cookie: cookie[who] } : {}, payload: { session } });
    return { nudge, plugins, ben, anna, source, hub };
  }

  it("a deafened person in the same room gets a line in the Mumble log and an event in their own web UIs", async () => {
    const { nudge, plugins, ben, anna } = await setup({ benDeaf: "self" });
    expect((await nudge("anna", 8)).statusCode).toBe(204);
    expect(plugins[8]!.last("notify")).toEqual({ v: 1, type: "notify", text: "Anna nudged you and would like your attention." });
    expect(ben.last("nudge")).toEqual({ v: 1, type: "nudge", session: 7, name: "Anna" });
    expect(anna.last("nudge")).toBeUndefined();
    expect(plugins[7]!.last("notify")).toBeUndefined();
  });

  it("deafened by the server counts too", async () => {
    const { nudge } = await setup({ benDeaf: "server" });
    expect((await nudge("anna", 8)).statusCode).toBe(204);
  });

  it("once a minute for the same person", async () => {
    const { nudge, plugins } = await setup({ benDeaf: "self" });
    expect((await nudge("anna", 8)).statusCode).toBe(204);
    const again = await nudge("anna", 8);
    expect(again.statusCode).toBe(429);
    expect(again.json()).toEqual({ error: "rate-limited" });
    expect(plugins[8]!.sent.filter((m) => m.type === "notify")).toHaveLength(1);
  });

  it("refused: unpaired, oneself, unknown, without plugin, another room, not deafened", async () => {
    const deaf = await setup({ benDeaf: "self" });
    expect((await deaf.nudge(null, 8)).json()).toEqual({ error: "not-paired" });
    expect((await deaf.nudge("anna", 7)).json()).toEqual({ error: "invalid" });
    expect((await deaf.nudge("anna", "8")).json()).toEqual({ error: "invalid" });
    expect((await deaf.nudge("anna", 99)).json()).toEqual({ error: "not-found" });
    const other = await deaf.nudge("clara", 8);
    expect(other.statusCode).toBe(403);
    expect(other.json()).toEqual({ error: "not-in-room" });
    expect((await (await setup({ benDeaf: "self", benPlugin: false })).nudge("anna", 8)).json()).toEqual({ error: "not-found" });
    const hearing = await (await setup()).nudge("anna", 8);
    expect(hearing.statusCode).toBe(409);
    expect(hearing.json()).toEqual({ error: "not-deaf" });
  });

  it("a refused nudge does not count for the minute", async () => {
    const { nudge, hub, source } = await setup();
    expect((await nudge("anna", 8)).statusCode).toBe(409);
    source.users[1]!.selfDeaf = true;
    await new Poller(source, { onChange: (s) => hub.setState(s) }).poll();
    expect((await nudge("anna", 8)).statusCode).toBe(204);
  });

  it("the text in both languages, the name shortened", () => {
    expect(nudgeText("Anna")).toBe("Anna hat dich angestupst und möchte etwas von dir.");
    expect(nudgeText("x".repeat(200), "en")).toBe(`${"x".repeat(120)} nudged you and would like your attention.`);
  });
});
