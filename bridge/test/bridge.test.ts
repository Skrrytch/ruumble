import { describe, expect, it } from "vitest";
import type { BridgeToPlugin, BridgeToUi } from "@ruumble/protocol";
import { Hub } from "../src/hub.ts";
import { formatAddress } from "../src/mumble.ts";
import { Pairing } from "../src/pairing.ts";
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
  it("IPv4 in IPv6 wird zu a.b.c.d, IPv6 bleibt", () => {
    expect(formatAddress([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 172, 23, 0, 1])).toBe("172.23.0.1");
    expect(formatAddress([0x20, 0x01, 0x0d, 0xb8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])).toBe("2001:db8:0:0:0:0:0:1");
    expect(formatAddress([])).toBe("");
  });
});

describe("Pairing", () => {
  it("Einmal-Code nur einmal und nur bis zum Ablauf", () => {
    const p = new Pairing(null, 60_000);
    const code = p.createCode(A, "Anna", 0);
    expect(p.redeem(code, 1000)).toBeTruthy();
    expect(p.redeem(code, 1000)).toBeNull();
    expect(p.redeem(p.createCode(A, "Anna", 0), 61_000)).toBeNull();
  });

  it("Token gehört zum Hash und lässt sich widerrufen", () => {
    const p = new Pairing(null);
    const token = p.redeem(p.createCode(A, "Anna"))!;
    expect(p.certHashOf(token)).toBe(A);
    expect(p.certHashOf("falsch")).toBeNull();
    p.revoke(token);
    expect(p.certHashOf(token)).toBeNull();
  });
});

describe("Poller", () => {
  it("meldet nur echte Änderungen und fragt Rechte nur für gekoppelte Sessions", async () => {
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

  it("erkennt einen Neustart an kleinerer Uptime", async () => {
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
  it("hello mit passendem Hash → welcome mit Kopplungslink", async () => {
    const { hub } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(hello());
    expect(plugin.last("welcome")?.pairUrl).toMatch(/^https:\/\/ruumble\.test\/pair\?code=/);
    expect(hub.pluginCount).toBe(1);
    expect(hub.clientVersions()).toEqual({ "mumble unknown / plugin 0.1.0": 1 }); // altes Plugin ohne mumbleVersion
  });

  it("Plugin meldet die Mumble-Version → sichtbar in clientVersions", async () => {
    const { hub } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(JSON.stringify({ ...JSON.parse(hello()), pluginVersion: "0.4.0", mumbleVersion: "1.5.735" }));
    expect(hub.clientVersions()).toEqual({ "mumble 1.5.735 / plugin 0.4.0": 1 });
  });

  it("bereits gekoppelt → welcome ohne Link", async () => {
    const { hub } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(hello(7, A, true));
    expect(plugin.last("welcome")).toEqual({ v: 1, type: "welcome" });
  });

  it.each([
    [hello(99), "unknown-session"],
    [hello(7, "c".repeat(40)), "hash-mismatch"],
  ])("Ablehnung: %s → %s", async (msg, reason) => {
    const { hub } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(msg);
    expect(plugin.last("reject")?.reason).toBe(reason);
    expect(plugin.closed?.code).toBe(4403);
  });

  it("Adressprüfung: warn lässt zu, enforce lehnt ab", async () => {
    for (const [mode, expected] of [["warn", "welcome"], ["enforce", "reject"]] as const) {
      const { hub } = await setup({ addressCheck: mode });
      const plugin = recorder<BridgeToPlugin>();
      await hub.pluginConnected(plugin.conn, "192.168.1.50").onMessage(hello());
      expect(plugin.sent[0]?.type).toBe(expected);
    }
  });

  it("unbekannte Session: erst neu abfragen, dann entscheiden", async () => {
    const source = new FakeSource();
    const hub = new Hub({ source, pairing: new Pairing(null), publicUrl: "https://r.test", addressCheck: "off", preview: false, refresh: () => poller.poll() });
    const poller: Poller = new Poller(source, { onChange: (s) => hub.setState(s) });
    await poller.poll();
    source.users.push({ ...source.users[0]!, session: 9, name: "Neu" });
    source.hashes[9] = "d".repeat(40);
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(hello(9, "d".repeat(40)));
    expect(plugin.sent[0]?.type).toBe("welcome");
  });

  it("ohne Zertifikat → no-certificate", async () => {
    const { hub, source } = await setup();
    delete source.hashes[7];
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(hello());
    expect(plugin.last("reject")?.reason).toBe("no-certificate");
  });

  it("Nachrichten vor hello werden ignoriert, ungültiges JSON auch", async () => {
    const { hub } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    const h = hub.pluginConnected(plugin.conn, "10.0.0.7");
    await h.onMessage('{"v":1,"type":"bye"}');
    await h.onMessage("kaputt");
    expect(plugin.sent).toEqual([]);
  });

  it("zweite Verbindung desselben Nutzers ersetzt die erste", async () => {
    const { hub } = await setup();
    const first = recorder<BridgeToPlugin>();
    const second = recorder<BridgeToPlugin>();
    await hub.pluginConnected(first.conn, "10.0.0.7").onMessage(hello());
    await hub.pluginConnected(second.conn, "10.0.0.7").onMessage(hello());
    expect(first.closed?.code).toBe(4001);
    expect(hub.pluginCount).toBe(1);
  });

  it("Server-Neustart schließt alle Plugins (neue Sessions)", async () => {
    const { hub } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(hello());
    hub.serverRestarted();
    expect(plugin.closed?.code).toBe(4000);
  });
});

describe("Hub: Oberfläche", () => {
  it("ohne Kopplung abgewiesen, in der Vorschau nur lesend", async () => {
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

  it("gekoppelt: Snapshot mit self und canEnter, ohne IP-Adressen", async () => {
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

  it("Befehl wird weitergeleitet, Ergebnis kommt mit der ID der Oberfläche zurück", async () => {
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

  it("join ohne Zutrittsrecht oder in unbekannten Kanal wird gar nicht erst weitergeleitet", async () => {
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

  it("ohne Plugin → offline; Plugin trennt → offene Befehle offline, Status disconnected", async () => {
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

  it("Missbrauchsschutz: mehr als 5 Befehle pro Sekunde werden abgelehnt", async () => {
    const { hub, pairing } = await setup();
    const plugin = recorder<BridgeToPlugin>();
    await hub.pluginConnected(plugin.conn, "10.0.0.7").onMessage(hello(7, A, true));
    const { ui, handler } = await pairedUi(hub, pairing);
    for (let i = 0; i < 7; i++) handler.onMessage(JSON.stringify({ v: 1, type: "command", id: `c${i}`, body: { cmd: "join", channel: 2 } }));
    expect(plugin.sent.filter((m) => m.type === "command")).toHaveLength(5);
    expect(ui.sent.filter((m) => m.type === "result")).toHaveLength(2);
  });

  it("Snapshot: userId, idleMinutes, recording und Avatar-Version", async () => {
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

  it("talking nur an die eigenen Oberflächen, selfState sofort an alle", async () => {
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
