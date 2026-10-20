import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { BridgeToPlugin, BridgeToUi, Snapshot, TubeMessage } from "@ruumble/protocol";
import { Gate } from "../src/access.ts";
import { Hub, personIdOf } from "../src/hub.ts";
import { Pairing } from "../src/pairing.ts";
import { Poller } from "../src/poller.ts";
import { tubeRoutes, tubeText } from "../src/tube.ts";
import { FakeSource, recorder } from "./fake.ts";

const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40);
const anna = personIdOf(A), ben = personIdOf(B), clara = personIdOf(C);

describe("tube mail (ADR-0021)", () => {
  /** Anna (7) on the floor, Ben (8) in the office, Clara (9) without a plugin; Anna has two windows open */
  async function setup(o: { perMinute?: number } = {}) {
    const source = new FakeSource();
    source.users.push({ ...source.users[0]!, session: 9, name: "Clara", channel: 2, address: "10.0.0.9" });
    source.hashes[9] = C;
    const pairing = new Pairing(null);
    const hub = new Hub({ source, pairing, addressCheck: "off", preview: false });
    await new Poller(source, { onChange: (s) => hub.setState(s) }).poll();
    const plugins: Record<number, ReturnType<typeof recorder<BridgeToPlugin>>> = {};
    for (const [session, hash, locale] of [[7, A, "de"], [8, B, "en"]] as const) {
      plugins[session] = recorder<BridgeToPlugin>();
      await hub.pluginConnected(plugins[session].conn, "x").onMessage(JSON.stringify({ v: 1, type: "hello", session, certHash: hash, pluginVersion: "0", paired: true, locale }));
    }
    const uis = { anna: recorder<BridgeToUi>(), anna2: recorder<BridgeToUi>(), ben: recorder<BridgeToUi>(), clara: recorder<BridgeToUi>() };
    hub.uiConnected(uis.anna.conn, A);
    hub.uiConnected(uis.anna2.conn, A);
    hub.uiConnected(uis.ben.conn, B);
    hub.uiConnected(uis.clara.conn, C);
    const cookie = { anna: pairing.redeem(pairing.createCode(A, "Anna"))!, clara: pairing.redeem(pairing.createCode(C, "Clara"))! };
    const app = Fastify();
    await app.register(tubeRoutes, { hub, gate: new Gate({ hub, source, certHashOf: (c) => pairing.certHashOf(c) }), now: () => 1_000, ...o });
    const send = (who: keyof typeof cookie | null, payload: unknown) =>
      app.inject({ method: "POST", url: "/api/tube", headers: who ? { cookie: cookie[who] } : {}, payload: payload as object });
    return { send, plugins, uis };
  }

  it("the snapshot names everyone with a plugin by a stable id, not by the certificate hash", async () => {
    const { uis } = await setup();
    const users = (uis.clara.last("snapshot") as Snapshot).users;
    expect(users.find((u) => u.session === 7)?.person).toBe(anna);
    expect(users.find((u) => u.session === 9)?.person).toBeUndefined();
    expect(anna).toMatch(/^[0-9a-f]{16}$/);
    expect(personIdOf(A)).toBe(anna);
    expect(JSON.stringify(users)).not.toContain(A);
  });

  it("a text goes to the web UIs of both people and as a line to the recipient's Mumble log", async () => {
    const { send, plugins, uis } = await setup();
    const res = await send("anna", { kind: "text", to: ben, text: "  Got a minute?\nIt's about the release.  " });
    expect(res.statusCode).toBe(200);
    const message = res.json() as TubeMessage;
    expect(message).toMatchObject({ from: anna, to: ben, fromName: "Anna", toName: "Ben", at: 1_000, kind: "text", text: "Got a minute?\nIt's about the release." });
    expect(uis.ben.last("tube")).toEqual({ v: 1, type: "tube", message });
    expect(uis.anna.last("tube")).toEqual({ v: 1, type: "tube", message });
    expect(uis.anna2.last("tube")).toEqual({ v: 1, type: "tube", message });
    expect(uis.clara.last("tube")).toBeUndefined();
    expect(plugins[8]!.last("notify")).toEqual({ v: 1, type: "notify", text: "Tube mail from Anna: Got a minute? It's about the release." });
    expect(plugins[7]!.last("notify")).toBeUndefined();
  });

  it("an invitation carries the sender's room; a reaction reaches the web UIs only", async () => {
    const { send, plugins, uis } = await setup();
    const invite = (await send("anna", { kind: "invite", to: ben })).json() as TubeMessage;
    expect(invite).toMatchObject({ kind: "invite", channelId: 1, channelName: "1F" });
    expect(plugins[8]!.last("notify")?.text).toBe("Tube mail from Anna: Come over to 1F!");
    const reaction = await send("anna", { kind: "reaction", to: ben, target: invite.id, reaction: "agree", on: true });
    expect(reaction.json()).toMatchObject({ kind: "reaction", target: invite.id, reaction: "agree", on: true });
    expect(uis.ben.last("tube")?.message.kind).toBe("reaction");
    expect(plugins[8]!.sent.filter((m) => m.type === "notify")).toHaveLength(1);
  });

  it("refused: unpaired, without own plugin, oneself, invalid, unknown or without plugin", async () => {
    const { send } = await setup();
    expect((await send(null, { kind: "text", to: ben, text: "hi" })).json()).toEqual({ error: "not-paired" });
    expect((await send("clara", { kind: "text", to: ben, text: "hi" })).json()).toEqual({ error: "not-paired" });
    expect((await send("anna", { kind: "text", to: anna, text: "hi" })).json()).toEqual({ error: "invalid" });
    expect((await send("anna", { kind: "text", to: ben, text: "   " })).json()).toEqual({ error: "invalid" });
    expect((await send("anna", { kind: "text", to: ben, text: "x".repeat(2001) })).json()).toEqual({ error: "invalid" });
    expect((await send("anna", { kind: "shout", to: ben })).json()).toEqual({ error: "invalid" });
    const unknown = await send("anna", { kind: "text", to: clara, text: "hi" });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: "not-found" });
  });

  it("a limit per person and minute; refused messages do not count", async () => {
    const { send } = await setup({ perMinute: 2 });
    expect((await send("anna", { kind: "text", to: clara, text: "hi" })).statusCode).toBe(404);
    expect((await send("anna", { kind: "text", to: ben, text: "1" })).statusCode).toBe(200);
    expect((await send("anna", { kind: "text", to: ben, text: "2" })).statusCode).toBe(200);
    const third = await send("anna", { kind: "text", to: ben, text: "3" });
    expect(third.statusCode).toBe(429);
    expect(third.json()).toEqual({ error: "rate-limited" });
  });

  it("the log line in both languages, on one line and shortened to fit", () => {
    const head = { id: "m", from: anna, to: ben, fromName: "Anna", toName: "Ben", at: 0 };
    expect(tubeText({ ...head, kind: "text", text: "Hallo" })).toBe("Rohrpost von Anna: Hallo");
    expect(tubeText({ ...head, kind: "invite", channelId: 3, channelName: "Küche" })).toBe("Rohrpost von Anna: Komm rüber in den Raum Küche!");
    const long = tubeText({ ...head, kind: "text", text: "x".repeat(2000) }, "en")!;
    expect(long).toHaveLength(300);
    expect(long.endsWith("x…")).toBe(true);
    expect(tubeText({ ...head, kind: "reaction", target: "m", reaction: "agree", on: true })).toBeNull();
  });
});
