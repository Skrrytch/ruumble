import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import type { BridgeToPlugin, BridgeToUi } from "@ruumble/protocol";
import { Hub } from "../src/hub.ts";
import { keyRoutes } from "../src/keys.ts";
import { Pairing, deviceLabel } from "../src/pairing.ts";
import { Poller } from "../src/poller.ts";
import { FakeSource, recorder } from "./fake.ts";

const A = "a".repeat(40), B = "b".repeat(40);
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";
const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

describe("Pairing: keys (ADR-0015)", () => {
  it("device labels: browser family and system, no versions", () => {
    expect(deviceLabel(FIREFOX)).toBe("Firefox on Linux");
    expect(deviceLabel(CHROME_WIN)).toBe("Chrome on Windows");
    expect(deviceLabel(`${CHROME_WIN} Edg/140.0`)).toBe("Edge on Windows");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605 Version/18.0 Mobile Safari/604.1")).toBe("Safari on iOS");
    expect(deviceLabel("curl/8")).toBe("");
    expect(deviceLabel(undefined)).toBe("");
  });

  it("keys per person, last used at most hourly, the device learned on first use, revoke by id", () => {
    const p = new Pairing(null);
    const t1 = p.redeem(p.createCode(A, "Anna", 0), 0, FIREFOX)!;
    const t2 = p.redeem(p.createCode(A, "Anna B.", 1000), 1000)!;
    p.redeem(p.createCode(B, "Ben", 0), 0, CHROME_WIN);
    const id1 = p.keyIdOf(t1)!;
    expect(id1).toMatch(/^[0-9a-f]{16}$/);
    const anna = p.keys(id1).find((h) => h.certHash === A)!;
    expect(anna.name).toBe("Anna B."); // the name at the latest pairing
    expect(anna.keys.map((k) => [k.device, k.created, k.current])).toEqual([["", 1000, false], ["Firefox on Linux", 0, true]]);
    p.touch(t2, CHROME_WIN, 2000); // device learned, last used not yet stale
    p.touch(t1, CHROME_WIN, 2 * 60 * 60_000); // device kept, last used updated
    const keys = p.keys().find((h) => h.certHash === A)!.keys;
    expect(keys.map((k) => [k.device, k.lastUsed])).toEqual([["Chrome on Windows", 1000], ["Firefox on Linux", 2 * 60 * 60_000]]);
    expect(p.revokeKey(id1)).toBe(A);
    expect(p.certHashOf(t1)).toBeNull();
    expect(p.revokeKey(id1)).toBeNull();
    expect(p.keyIdOf("nope")).toBeNull();
  });
});

describe("REST /api/keys (ADR-0015)", () => {
  async function setup() {
    const source = new FakeSource();
    source.admins.add(8); // Ben may tend the building
    const pairing = new Pairing(null);
    const hub = new Hub({ source, pairing, publicUrl: "http://r", addressCheck: "off", preview: false });
    const poller = new Poller(source, { onChange: (s) => hub.setState(s) });
    await poller.poll();
    for (const [session, hash] of [[7, A], [8, B]] as const) {
      await hub.pluginConnected(recorder<BridgeToPlugin>().conn, "x").onMessage(JSON.stringify({ v: 1, type: "hello", session, certHash: hash, pluginVersion: "0", paired: true }));
    }
    const anna = pairing.redeem(pairing.createCode(A, "Anna"), Date.now(), FIREFOX)!;
    const annaPhone = pairing.redeem(pairing.createCode(A, "Anna"))!;
    const ben = pairing.redeem(pairing.createCode(B, "Ben"))!;
    const cleared: string[] = [];
    const app = Fastify();
    await app.register(keyRoutes, {
      pairing, hub, source,
      tokenOf: (cookie) => cookie,
      clearCookie: () => void cleared.push("cleared"),
    });
    return { app, pairing, hub, tokens: { anna, annaPhone, ben }, cleared };
  }

  it("everyone sees their own keys, admins everyone's", async () => {
    const { app, pairing, tokens } = await setup();
    expect((await app.inject({ url: "/api/keys" })).statusCode).toBe(401);
    const anna = (await app.inject({ url: "/api/keys", headers: { cookie: tokens.anna } })).json();
    expect(anna.others).toBeNull();
    expect(anna.mine).toHaveLength(2);
    expect(anna.mine.find((k: { current: boolean }) => k.current)).toMatchObject({ id: pairing.keyIdOf(tokens.anna), device: "Firefox on Linux" });
    const ben = (await app.inject({ url: "/api/keys", headers: { cookie: tokens.ben } })).json();
    expect(ben.mine).toHaveLength(1);
    expect(ben.others).toEqual([{ name: "Anna", keys: expect.arrayContaining([expect.objectContaining({ current: false })]) }]);
  });

  it("revoke: the own key (logs this browser out), others' only as admin; open web UIs become unpaired", async () => {
    const { app, pairing, hub, tokens, cleared } = await setup();
    const del = (id: string, cookie: string) => app.inject({ method: "DELETE", url: `/api/keys/${id}`, headers: { cookie } });
    const benKey = pairing.keyIdOf(tokens.ben)!;
    expect((await del(benKey, tokens.anna)).statusCode).toBe(403);
    expect((await del("0".repeat(16), tokens.anna)).statusCode).toBe(404);
    const phone = recorder<BridgeToUi>();
    hub.uiConnected(phone.conn, A, pairing.keyIdOf(tokens.annaPhone));
    expect((await del(pairing.keyIdOf(tokens.annaPhone)!, tokens.anna)).statusCode).toBe(204);
    expect(phone.closed).toEqual({ code: 4401, reason: "not-paired" });
    expect(cleared).toEqual([]);
    expect((await del(pairing.keyIdOf(tokens.anna)!, tokens.ben)).statusCode).toBe(204); // admin
    expect(pairing.certHashOf(tokens.anna)).toBeNull();
    expect((await del(benKey, tokens.ben)).statusCode).toBe(204);
    expect(cleared).toEqual(["cleared"]);
  });
});
