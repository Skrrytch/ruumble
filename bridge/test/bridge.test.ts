import { describe, expect, it } from "vitest";
import type { BridgeToPlugin, BridgeToUi } from "@ruumble/protocol";
import { Hub } from "../src/hub.ts";
import { formatAddress } from "../src/mumble.ts";
import { CODE_REQUEST_INTERVAL_MS, CODE_REQUEST_TTL_MS, Pairing, newKeyText, pairingCodeText } from "../src/pairing.ts";
import { Poller } from "../src/poller.ts";
import { FakeSource, recorder } from "./fake.ts";

const A = "a".repeat(40);
const hello = (session = 7, certHash = A, paired = false) => JSON.stringify({ v: 1, type: "hello", session, certHash, pluginVersion: "0.1.0", paired });
const flush = () => new Promise((r) => setTimeout(r, 0));

async function setup(opts: { preview?: boolean; addressCheck?: "off" | "warn" | "enforce" } = {}) {
  const source = new FakeSource();
  const pairing = new Pairing(null);
  const hub = new Hub({ source, pairing, publicUrl: "https://ruumble.test", addressCheck: opts.addressCheck ?? "warn", preview: opts.preview ?? false });
  const poller = new Poller(source, { onChange: (s) => hub.setState(s) });
  await poller.poll();
  return { source, pairing, hub, poller };
}

async function pairedUi(hub: Hub, pairing: Pairing, certHash = A) {
  const code = pairing.createCode(certHash, "Anna");
  const token = pairing.redeem(code)!;
  const ui = recorder<BridgeToUi>();
  const handler = hub.uiConnected(ui.conn, pairing.certHashOf(token));
  return { ui, handler, token };
}

describe("formatAddress", () => {
  it("IPv4-in-IPv6 becomes a.b.c.d, IPv6 stays", () => {
    expect(formatAddress([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 172, 23, 0, 1])).toBe("172.23.0.1");
    expect(formatAddress([0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])).toBe("2001:db8:0:0:0:0:0:1");
    expect(formatAddress([])).toBe("");
  });
});

describe("Pairing", () => {
  it("one-time code works only once and only until expiry", () => {
    const p = new Pairing(null, 60_000);
    const code = p.createCode(A, "Anna", 0);
    expect(p.redeem(code, 1000)).toBeTruthy();
    expect(p.redeem(code, 1000)).toBeNull();
    expect(p.redeem(p.createCode(A, "Anna", 0), 61_000)).toBeNull();
  });

  it("token belongs to the hash and can be revoked", () => {
    const p = new Pairing(null);
    const token = p.redeem(p.createCode(A, "Anna"))!;
    expect(p.certHashOf(token)).toBe(A);
    expect(p.certHashOf("wrong")).toBeNull();
    p.revoke(token);
    expect(p.certHashOf(token)).toBeNull();
  });
});

describe("Pairing with a code (ADR-0012)", () => {
  const anna = { certHash: A, name: "Anna" };
  const B = "b".repeat(40);

  it("one 6-digit code per target; the right code gives a token for that hash, only once", () => {
    const p = new Pairing(null);
    const r = p.requestCodes("10.0.0.7", [anna, { certHash: B, name: "Ben" }], 0);
    if (typeof r === "string") throw new Error(r);
    expect(r.codes).toHaveLength(2);
    for (const c of r.codes) expect(c.code).toMatch(/^\d{6}$/);
    expect(r.codes[0]!.code).not.toBe(r.codes[1]!.code);
    const ben = r.codes.find((c) => c.certHash === B)!.code;
    const token = p.confirmCode(r.request, ben, 1000);
    expect(p.certHashOf(token)).toBe(B);
    expect(p.confirmCode(r.request, ben, 1000)).toBe("expired");
  });

  it("no target → no-plugin; second request from the same address within 10 s → rate-limited", () => {
    const p = new Pairing(null);
    expect(p.requestCodes("10.0.0.7", [], 0)).toBe("no-plugin");
    expect(typeof p.requestCodes("10.0.0.7", [anna], 0)).toBe("object");
    expect(p.requestCodes("10.0.0.7", [anna], CODE_REQUEST_INTERVAL_MS - 1)).toBe("rate-limited");
    expect(typeof p.requestCodes("10.0.0.8", [anna], 1)).toBe("object");
    expect(typeof p.requestCodes("10.0.0.7", [anna], CODE_REQUEST_INTERVAL_MS)).toBe("object");
  });

  it("5 wrong attempts or expiry void the request", () => {
    const p = new Pairing(null);
    const r = p.requestCodes("10.0.0.7", [anna], 0);
    if (typeof r === "string") throw new Error(r);
    const wrong = r.codes[0]!.code === "000000" ? "000001" : "000000";
    for (let i = 0; i < 4; i++) expect(p.confirmCode(r.request, wrong, 0)).toBe("wrong-code");
    expect(p.confirmCode(r.request, wrong, 0)).toBe("expired");
    expect(p.confirmCode(r.request, r.codes[0]!.code, 0)).toBe("expired");
    const late = p.requestCodes("10.0.0.9", [anna], 0);
    if (typeof late === "string") throw new Error(late);
    expect(p.confirmCode(late.request, late.codes[0]!.code, CODE_REQUEST_TTL_MS + 1)).toBe("expired");
    expect(p.confirmCode("unknown", "123456", 0)).toBe("expired");
  });

  it("new key notice: just now or with the date, keys older than 30 days are not told any more", () => {
    const day = 86_400_000;
    const now = Date.UTC(2026, 9, 3, 12);
    expect(newKeyText("Safari on iOS", now - 2 * day, now, "en")).toBe('On 1 October 2026, a browser was paired with your Mumble certificate (Safari on iOS). If that was not you, revoke the key in Ruumble under "My keys".');
    expect(newKeyText("", now - 2 * day, now, "de")).toMatch(/^Am 1\. Oktober 2026 wurde ein Browser .* \(unbekannter Browser\)/);
    const pairing = new Pairing(null);
    pairing.redeem(pairing.createCode(A, "Anna", now - 40 * day), now - 40 * day);
    pairing.redeem(pairing.createCode(A, "Anna", now - day), now - day);
    expect(pairing.takeUnnoticedKeys(A, "10.0.0.7", now)).toHaveLength(1);
    expect(pairing.takeUnnoticedKeys(A, "10.0.0.7", now)).toEqual([]);
    expect(pairing.takeUnnoticedKeys("b".repeat(40), "10.0.0.8", now)).toEqual([]);
  });

  it("notice text in the plugin's language, code in two groups", () => {
    expect(pairingCodeText("482913", "en")).toBe("Pairing code for a browser: 482 913 (valid for 5 minutes). Ignore it if you did not request it.");
    expect(pairingCodeText("482913")).toContain("Kopplungscode für einen Browser: 482 913");
  });
});

describe("Poller", () => {
  it("reports only real changes and queries permissions only for paired sessions", async () => {
    const source = new FakeSource();
    let changes = 0;
    const poller = new Poller(source, { onChange: () => changes++ });
    await poller.poll();
    await poller.poll();
    expect(changes).toBe(1);
    expect(source.calls.filter((c) => c.startsWith("canEnter"))).toEqual([]);
    poller.watchSessions([7]);
    await poller.poll();
    expect(poller.state?.canEnter.get(7)).toEqual({ "3": false });
    source.users[1]!.selfMute = true;
    await poller.poll();
    expect(changes).toBe(3);
  });

  it("detects a restart by a smaller uptime", async () => {
    const source = new FakeSource();
    let restarts = 0;
    const poller = new Poller(source, { onChange: () => {}, onRestart: () => restarts++ });
    await poller.poll();
    source.uptime = 3;
    await poller.poll();
    expect(restarts).toBe(1);
  });
});

describe("Hub: Plugin", () => {
  it("hello with matching hash → welcome with pairing link", async () => {
    const { hub } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(hello());
    expect(plugin.last("welcome")?.pairUrl).toMatch(/^https:\/\/ruumble\.test\/pair\?code=/);
    expect(hub.pluginCount).toBe(1);
    expect(hub.clientVersions()).toEqual({ "mumble unknown / plugin 0.1.0": 1 }); // old plugin without mumbleVersion
  });

  it("without publicUrl the pairing link uses the address the plugin connected to", async () => {
    const source = new FakeSource();
    const hub = new Hub({ source, pairing: new Pairing(null), addressCheck: "off", preview: false });
    const poller = new Poller(source, { onChange: (s) => hub.setState(s) });
    await poller.poll();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7", "http://192.168.1.10:64080").onMessage(hello());
    expect(plugin.last("welcome")?.pairUrl).toMatch(/^http:\/\/192\.168\.1\.10:64080\/pair\?code=/);
  });

  it("publicUrl wins over the address the plugin connected to", async () => {
    const { hub } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7", "http://ruumble:64080").onMessage(hello());
    expect(plugin.last("welcome")?.pairUrl).toMatch(/^https:\/\/ruumble\.test\/pair\?code=/);
  });

  it("plugin reports the Mumble version → visible in clientVersions", async () => {
    const { hub } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(JSON.stringify({ ...JSON.parse(hello()), pluginVersion: "0.4.0", mumbleVersion: "1.5.735" }));
    expect(hub.clientVersions()).toEqual({ "mumble 1.5.735 / plugin 0.4.0": 1 });
  });

  it("already paired → welcome without link", async () => {
    const { hub } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(hello(7, A, true));
    expect(plugin.last("welcome")).toEqual({ v: 1, type: "welcome" });
  });

  it.each([
    [hello(99), "unknown-session"],
    [hello(7, "c".repeat(40)), "hash-mismatch"],
  ])("rejection: %s → %s", async (msg, reason) => {
    const { hub } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(msg);
    expect(plugin.last("reject")?.reason).toBe(reason);
    expect(plugin.closed?.code).toBe(4403);
  });

  it("address check: warn allows, enforce rejects", async () => {
    for (const [mode, expected] of [["warn", "welcome"], ["enforce", "reject"]] as const) {
      const { hub } = await setup({ addressCheck: mode });
      const plugin = recorder<BridgeToPlugin>();
      await hub.pluginConnected(plugin.conn, "192.168.1.50").onMessage(hello());
      expect(plugin.sent[0]?.type).toBe(expected);
    }
  });

  it("unknown session: query again first, then decide", async () => {
    const source = new FakeSource();
    const hub = new Hub({ source, pairing: new Pairing(null), publicUrl: "https://r.test", addressCheck: "off", preview: false, refresh: () => poller.poll() });
    const poller: Poller = new Poller(source, { onChange: (s) => hub.setState(s) });
    await poller.poll();
    source.users.push({ ...source.users[0]!, session: 9, name: "New" });
    source.hashes[9] = "d".repeat(40);
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(hello(9, "d".repeat(40)));
    expect(plugin.sent[0]?.type).toBe("welcome");
  });

  it("without certificate → no-certificate", async () => {
    const { hub, source } = await setup();
    delete source.hashes[7];
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(hello());
    expect(plugin.last("reject")?.reason).toBe("no-certificate");
  });

  it("messages before hello are ignored, as is invalid JSON", async () => {
    const { hub } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    const h = hub.pluginConnected(plugin.conn, "10.0.0.7");
    await h.onMessage('{"v":1,"type":"bye"}');
    await h.onMessage("broken");
    expect(plugin.sent).toEqual([]);
  });

  it("second connection of the same user replaces the first", async () => {
    const { hub } = await setup();
    const first = recorder<BridgeToPlugin>();
    const second = recorder<BridgeToPlugin>();
    await hub.pluginConnected(first.conn, "10.0.0.7").onMessage(hello());
    await hub.pluginConnected(second.conn, "10.0.0.7").onMessage(hello());
    expect(first.closed?.code).toBe(4001);
    expect(hub.pluginCount).toBe(1);
  });

  it("a second plugin from another address does not take over; from Mumble's address of the user it does (ADR-0017)", async () => {
    const { hub } = await setup();
    const first = recorder<BridgeToPlugin>();
    await hub.pluginConnected(first.conn, "192.168.1.50").onMessage(hello()); // warn: not Mumble's address, still accepted
    const forger = recorder<BridgeToPlugin>();
    await hub.pluginConnected(forger.conn, "192.168.1.60").onMessage(hello());
    expect(forger.last("reject")?.reason).toBe("already-connected");
    expect(forger.closed?.code).toBe(4409);
    expect(first.closed).toBeNull();
    const real = recorder<BridgeToPlugin>();
    await hub.pluginConnected(real.conn, "10.0.0.7").onMessage(hello()); // Mumble sees Anna at 10.0.0.7 (fake)
    expect(real.last("welcome")).toBeDefined();
    expect(first.closed?.code).toBe(4001);
  });

  it("a new key is told to the owner's plugin, and once more to a plugin from another address (ADR-0017)", async () => {
    const { hub, pairing } = await setup();
    const forger = recorder<BridgeToPlugin>();
    const h = hub.pluginConnected(forger.conn, "192.168.1.60");
    await h.onMessage(hello());
    const code = new URL(forger.last("welcome")!.pairUrl!).searchParams.get("code")!;
    pairing.redeem(code, Date.now(), "Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0");
    hub.keyIssued(A);
    expect(forger.last("notify")?.text).toBe("Gerade wurde ein Browser mit deinem Mumble-Zertifikat gekoppelt (Firefox unter Linux). Warst du das nicht, ziehe den Schlüssel in Ruumble unter „Meine Schlüssel“ zurück.");
    h.onClose();
    const real = recorder<BridgeToPlugin>();
    await hub.pluginConnected(real.conn, "10.0.0.7").onMessage(JSON.stringify({ ...JSON.parse(hello(7, A, true)), locale: "en" }));
    expect(real.last("notify")?.text).toMatch(/^A browser was paired with your Mumble certificate \(Firefox on Linux\)/);
    const again = recorder<BridgeToPlugin>();
    await hub.pluginConnected(again.conn, "10.0.0.7").onMessage(hello(7, A, true));
    expect(again.last("notify")).toBeUndefined(); // told this address already
  });

  it("server restart closes all plugins (new sessions)", async () => {
    const { hub } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(hello());
    hub.serverRestarted();
    expect(plugin.closed?.code).toBe(4000);
  });
});

describe("Hub: pairing with a code", () => {
  it("code goes to the plugin from the browser's address or whose Mumble user has it", async () => {
    const { hub, pairing } = await setup();
    const anna = recorder<BridgeToPlugin>();
    await hub.pluginConnected(anna.conn, "203.0.113.5").onMessage(hello(7, A, true)); // e.g. public address behind the proxy
    const r = hub.requestPairing("::ffff:203.0.113.5");
    if (typeof r === "string") throw new Error(r);
    const text = anna.last("notify")?.text ?? "";
    const code = /(\d{3}) (\d{3})/.exec(text)!.slice(1).join("");
    expect(pairing.certHashOf(pairing.confirmCode(r.request, code))).toBe(A);
    // Mumble's address of Anna is 10.0.0.7 (fake)
    const again = hub.requestPairing("10.0.0.7");
    expect(typeof again).toBe("object");
  });

  it("no plugin at the address → no-plugin, nothing sent", async () => {
    const { hub } = await setup();
    const anna = recorder<BridgeToPlugin>();
    await hub.pluginConnected(anna.conn, "10.0.0.7").onMessage(hello(7, A, true));
    expect(hub.requestPairing("10.0.0.99")).toBe("no-plugin");
    expect(anna.last("notify")).toBeUndefined();
  });
});

describe("Hub: web UI", () => {
  it("rejected without pairing, read-only in preview", async () => {
    const closed = await setup();
    const ui = recorder<BridgeToUi>();
    closed.hub.uiConnected(ui.conn, null);
    expect(ui.closed?.code).toBe(4401);

    const preview = await setup({ preview: true });
    const viewer = recorder<BridgeToUi>();
    preview.hub.uiConnected(viewer.conn, null);
    expect(viewer.last("status")).toEqual({ v: 1, type: "status", plugin: "disconnected", preview: true });
    expect(viewer.last("snapshot")?.self).toBeNull();
  });

  it("paired: snapshot with self and canEnter, without IP addresses", async () => {
    const { hub, pairing, poller } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(hello(7, A, true));
    poller.watchSessions([7]);
    await poller.poll();
    const { ui } = await pairedUi(hub, pairing);
    const snap = ui.last("snapshot")!;
    expect(ui.last("status")?.plugin).toBe("connected");
    expect(snap.self).toEqual({ session: 7 });
    expect(snap.canEnter).toEqual({ "3": false });
    expect(JSON.stringify(snap)).not.toContain("10.0.0.");
  });

  it("command is forwarded, result comes back with the web UI's ID", async () => {
    const { hub, pairing } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    const ph = hub.pluginConnected(plugin.conn, "10.0.0.7");
    await ph.onMessage(hello(7, A, true));
    const { ui, handler } = await pairedUi(hub, pairing);
    handler.onMessage(JSON.stringify({ v: 1, type: "command", id: "ui-1", body: { cmd: "join", channel: 2 } }));
    const cmd = plugin.last("command")!;
    expect(cmd.body).toEqual({ cmd: "join", channel: 2 });
    await ph.onMessage(JSON.stringify({ v: 1, type: "result", id: cmd.id, result: "ok" }));
    expect(ui.last("result")).toEqual({ v: 1, type: "result", id: "ui-1", result: "ok" });
  });

  it("join without enter permission or into an unknown channel is not forwarded at all", async () => {
    const { hub, pairing, poller } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(hello(7, A, true));
    poller.watchSessions([7]);
    await poller.poll();
    const { ui, handler } = await pairedUi(hub, pairing);
    handler.onMessage(JSON.stringify({ v: 1, type: "command", id: "x", body: { cmd: "join", channel: 3 } }));
    handler.onMessage(JSON.stringify({ v: 1, type: "command", id: "y", body: { cmd: "join", channel: 42 } }));
    expect(ui.sent.filter((m) => m.type === "result").map((m) => (m as { result: string }).result)).toEqual(["rejected", "rejected"]);
    expect(plugin.last("command")).toBeUndefined();
  });

  it("without plugin → offline; plugin disconnects → pending commands offline, status disconnected", async () => {
    const { hub, pairing } = await setup();
    const { ui, handler } = await pairedUi(hub, pairing);
    handler.onMessage(JSON.stringify({ v: 1, type: "command", id: "a", body: { cmd: "mute", on: true } }));
    expect(ui.last("result")?.result).toBe("offline");

    const plugin = recorder<BridgeToPlugin>();
    const ph = hub.pluginConnected(plugin.conn, "10.0.0.7");
    await ph.onMessage(hello(7, A, true));
    handler.onMessage(JSON.stringify({ v: 1, type: "command", id: "b", body: { cmd: "mute", on: true } }));
    ph.onClose();
    expect(ui.last("result")).toEqual({ v: 1, type: "result", id: "b", result: "offline" });
    expect(ui.last("status")?.plugin).toBe("disconnected");
    expect(ui.last("snapshot")?.self).toBeNull();
  });

  it("abuse protection: more than 5 commands per second are rejected", async () => {
    const { hub, pairing } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(hello(7, A, true));
    const { ui, handler } = await pairedUi(hub, pairing);
    for (let i = 0; i < 7; i++) handler.onMessage(JSON.stringify({ v: 1, type: "command", id: `c${i}`, body: { cmd: "join", channel: 2 } }));
    expect(plugin.sent.filter((m) => m.type === "command")).toHaveLength(5);
    expect(ui.sent.filter((m) => m.type === "result")).toHaveLength(2);
  });

  it("snapshot: userId, idleMinutes, recording and avatar version", async () => {
    const source = new FakeSource();
    const pairing = new Pairing(null);
    const hub = new Hub({ source, pairing, publicUrl: "https://r.test", addressCheck: "off", preview: true, avatarVersion: (id) => (id === 1 ? "0123456789abcdef" : null) });
    const poller = new Poller(source, { onChange: (st) => hub.setState(st) });
    await poller.poll();
    const ui = recorder<BridgeToUi>();
    hub.uiConnected(ui.conn, null);
    const users = ui.last("snapshot")!.users;
    expect(users.find((u) => u.name === "Anna")).toMatchObject({ userId: 1, avatar: "0123456789abcdef", idleMinutes: 0, recording: false });
    expect(users.find((u) => u.name === "Ben")).toMatchObject({ userId: null, avatar: null, idleMinutes: 3, recording: true });
    expect(hub.canView(null)).toBe(true);
  });

  it("talking only to one's own web UIs, selfState immediately to all", async () => {
    const { hub, pairing } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    const ph = hub.pluginConnected(plugin.conn, "10.0.0.7");
    await ph.onMessage(hello(7, A, true));
    const mine = await pairedUi(hub, pairing, A);
    const other = await pairedUi(hub, pairing, "b".repeat(40));
    await ph.onMessage(JSON.stringify({ v: 1, type: "talking", session: 8, state: "talking" }));
    expect(mine.ui.last("talking")).toEqual({ v: 1, type: "talking", session: 8, state: "talking" });
    expect(other.ui.last("talking")).toBeUndefined();
    await ph.onMessage(JSON.stringify({ v: 1, type: "selfState", selfMute: true, selfDeaf: false }));
    expect(other.ui.last("snapshot")?.users.find((u) => u.session === 7)?.selfMute).toBe(true);
    await flush();
  });
});
