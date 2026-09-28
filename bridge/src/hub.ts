/**
 * Vermittlung zwischen Plugins und Oberflächen (ADR-0001, -0003, -0004, -0005, -0007).
 * Unabhängig vom Transport: Verbindungen sind nur Objekte mit `send` und `close`.
 */
import { randomUUID } from "node:crypto";
import {
  PROTOCOL_VERSION,
  PluginToBridge,
  UiToBridge,
  parse,
  type BridgeToPlugin,
  type BridgeToUi,
  type CommandBody,
  type CommandResult,
  type Locale,
  type Snapshot,
} from "@ruumble/protocol";
import type { MumbleSource } from "./mumble.ts";
import type { Pairing } from "./pairing.ts";
import type { ServerState } from "./poller.ts";

export interface Conn<T> {
  send(msg: T): void;
  close(code: number, reason: string): void;
}

export type AddressCheck = "off" | "warn" | "enforce";

export interface HubOptions {
  source: MumbleSource;
  pairing: Pairing;
  /** öffentliche Basis-URL für Kopplungslinks, z. B. https://ruumble.example */
  publicUrl: string;
  addressCheck: AddressCheck;
  /** Vorschau: Oberflächen ohne Kopplung sehen das Gebäude nur lesend */
  preview: boolean;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
  onSessionsChanged?: (sessions: number[]) => void;
  /** sofort neu abfragen, z. B. wenn ein Plugin eine Session meldet, die das Polling noch nicht kennt */
  refresh?: () => Promise<void>;
  /** Version des Avatarbilds eines registrierten Nutzers (AP9) */
  avatarVersion?: (userId: number | null) => string | null;
}

/** Wer steht hinter einem Geräte-Token gerade wo? (Pinnwand, ADR-0011) */
export interface Viewer {
  certHash: string;
  session: number;
  name: string;
  channelId: number;
}

interface PluginEntry {
  conn: Conn<BridgeToPlugin>;
  certHash: string;
  session: number;
  /** Mumble-Client und Plugin, wie das Plugin sie meldet (Betrieb, Kompatibilität) */
  mumbleVersion: string;
  pluginVersion: string;
  locale: Locale;
}

/** Missbrauchsschutz je Nutzer; die Mumble-Grenzen behandelt das Plugin (ADR-0003) */
const MAX_COMMANDS_PER_SECOND = 5;

interface UiEntry {
  conn: Conn<BridgeToUi>;
  certHash: string | null;
  commandTimes: number[];
}

const v = PROTOCOL_VERSION;

export class Hub {
  private readonly opts: HubOptions;
  private state: ServerState | null = null;
  private readonly plugins = new Map<string, PluginEntry>();
  private readonly uis = new Set<UiEntry>();
  /** Befehls-ID im Plugin → Oberfläche und deren ID */
  private readonly pending = new Map<string, { ui: UiEntry; id: string; certHash: string }>();

  constructor(opts: HubOptions) {
    this.opts = opts;
  }

  // ---------------------------------------------------------------- Server-Stand

  setState(state: ServerState): void {
    this.state = state;
    this.rebroadcast();
  }

  /** Snapshots erneut senden, z. B. nach einem neuen Avatarbild */
  rebroadcast(): void {
    for (const ui of this.uis) this.sendSnapshot(ui);
  }

  /** gekoppelter Nutzer mit verbundenem Plugin und seinem aktuellen Kanal; sonst `null` */
  whoIs(certHash: string | null): Viewer | null {
    const plugin = certHash ? this.plugins.get(certHash) : undefined;
    const user = plugin && this.state?.users.find((u) => u.session === plugin.session);
    return plugin && user ? { certHash: plugin.certHash, session: plugin.session, name: user.name, channelId: user.channel } : null;
  }

  /** Ist dieser Kanal ein Raum mit Pinnwand? 2. Ebene, nicht temporär (ADR-0011) */
  isBoardRoom(channelId: number): boolean {
    const channels = this.state?.channels ?? [];
    const c = channels.find((x) => x.id === channelId);
    const floor = c && c.parent !== null ? channels.find((x) => x.id === c.parent) : undefined;
    return !!c && !c.temporary && !!floor && floor.parent === 0;
  }

  channelName(channelId: number): string {
    return this.state?.channels.find((c) => c.id === channelId)?.name ?? "";
  }

  /** Anwesende eines Raums über eine Änderung an der Pinnwand informieren (ohne Inhalt, die Oberfläche lädt neu) */
  boardChanged(channelId: number): void {
    for (const ui of this.uis) {
      if (this.whoIs(ui.certHash)?.channelId === channelId) ui.conn.send({ v, type: "board", channelId });
    }
  }

  /** Plugins der Anwesenden eines Raums (außer `except`) – für Hinweise im Mumble-Protokoll */
  pluginsIn(channelId: number, except?: string): { send: (msg: BridgeToPlugin) => void; locale: Locale }[] {
    return [...this.plugins.values()]
      .filter((p) => p.certHash !== except && this.state?.users.find((u) => u.session === p.session)?.channel === channelId)
      .map((p) => ({ send: (msg: BridgeToPlugin) => p.conn.send(msg), locale: p.locale }));
  }

  /** Darf diese Oberfläche Bilder und Daten sehen? (gekoppelt oder Vorschau, ADR-0004) */
  canView(certHash: string | null): boolean {
    return certHash !== null || this.opts.preview;
  }

  /** Virtueller Server neu gestartet: Sessions sind neu vergeben, Plugins melden sich neu an (S2). */
  serverRestarted(): void {
    for (const p of [...this.plugins.values()]) p.conn.close(4000, "server-restart");
  }

  // ---------------------------------------------------------------- Plugin

  pluginConnected(conn: Conn<BridgeToPlugin>, remoteAddress: string) {
    let entry: PluginEntry | null = null;
    return {
      onMessage: async (raw: string) => {
        const msg = parse(PluginToBridge, raw);
        if (!msg) return;
        if (msg.type === "hello") {
          const verdict = await this.verify(msg.session, msg.certHash, remoteAddress);
          if (verdict !== "ok") {
            this.log("Plugin abgelehnt", { reason: verdict, session: msg.session });
            conn.send({ v, type: "reject", reason: verdict });
            conn.close(4403, verdict);
            return;
          }
          const name = this.state?.users.find((u) => u.session === msg.session)?.name ?? "";
          const previous = this.plugins.get(msg.certHash);
          if (previous && previous.conn !== conn) previous.conn.close(4001, "replaced");
          if (entry && entry.certHash !== msg.certHash) this.removePlugin(entry);
          entry = { conn, certHash: msg.certHash, session: msg.session, mumbleVersion: msg.mumbleVersion ?? "unbekannt", pluginVersion: msg.pluginVersion, locale: msg.locale ?? "de" };
          this.plugins.set(msg.certHash, entry);
          const pairUrl = msg.paired ? undefined : `${this.opts.publicUrl}/pair?code=${this.opts.pairing.createCode(msg.certHash, name)}`;
          conn.send(pairUrl ? { v, type: "welcome", pairUrl } : { v, type: "welcome" });
          this.log("Plugin verbunden", { session: msg.session, name, plugin: msg.pluginVersion, mumble: entry.mumbleVersion });
          this.sessionsChanged();
          this.forUis(msg.certHash, (ui) => {
            ui.conn.send({ v, type: "status", plugin: "connected" });
            this.sendSnapshot(ui);
          });
          return;
        }
        if (!entry) return; // alles andere erst nach erfolgreichem hello
        const certHash = entry.certHash;
        switch (msg.type) {
          case "result": {
            const p = this.pending.get(msg.id);
            if (p && p.certHash === certHash) {
              this.pending.delete(msg.id);
              p.ui.conn.send({ v, type: "result", id: p.id, result: msg.result });
            }
            break;
          }
          case "selfState": {
            // sofortige Rückmeldung, ohne auf den nächsten Ice-Abgleich zu warten
            const u = this.state?.users.find((x) => x.session === entry!.session);
            if (u && (u.selfMute !== msg.selfMute || u.selfDeaf !== msg.selfDeaf)) {
              u.selfMute = msg.selfMute;
              u.selfDeaf = msg.selfDeaf;
              this.rebroadcast();
            }
            break;
          }
          case "talking":
            // nur an die eigenen Oberflächen (ADR-0005)
            this.forUis(certHash, (ui) => ui.conn.send({ v, type: "talking", session: msg.session, state: msg.state }));
            break;
          case "bye":
            this.removePlugin(entry);
            entry = null;
            break;
        }
      },
      onClose: () => {
        if (entry) this.removePlugin(entry);
        entry = null;
      },
    };
  }

  private async verify(session: number, certHash: string, remoteAddress: string): Promise<"ok" | "unknown-session" | "hash-mismatch" | "address-mismatch" | "no-certificate"> {
    let user = this.state?.users.find((u) => u.session === session);
    if (!user && this.opts.refresh) {
      // Das Plugin meldet sich direkt nach dem Sync, oft vor der nächsten Abfrage (Live-Test)
      await this.opts.refresh().catch(() => {});
      user = this.state?.users.find((u) => u.session === session);
    }
    if (!user) return "unknown-session";
    const hash = await this.opts.source.certHash(session);
    if (!hash) return "no-certificate";
    if (hash !== certHash) return "hash-mismatch";
    if (this.opts.addressCheck !== "off" && normalize(remoteAddress) !== normalize(user.address)) {
      this.log("Adresse des Plugins passt nicht zu Mumble", { session, plugin: remoteAddress, mumble: user.address });
      if (this.opts.addressCheck === "enforce") return "address-mismatch";
    }
    return "ok";
  }

  private removePlugin(entry: PluginEntry): void {
    if (this.plugins.get(entry.certHash) !== entry) return;
    this.plugins.delete(entry.certHash);
    for (const [id, p] of this.pending) {
      if (p.certHash === entry.certHash) {
        this.pending.delete(id);
        p.ui.conn.send({ v, type: "result", id: p.id, result: "offline" });
      }
    }
    this.log("Plugin getrennt", { session: entry.session });
    this.sessionsChanged();
    this.forUis(entry.certHash, (ui) => {
      ui.conn.send({ v, type: "status", plugin: "disconnected" });
      this.sendSnapshot(ui);
    });
  }

  // ---------------------------------------------------------------- Oberfläche

  /** `certHash = null`: ungekoppelt (nur in der Vorschau erlaubt) */
  uiConnected(conn: Conn<BridgeToUi>, certHash: string | null) {
    if (!certHash && !this.opts.preview) {
      conn.close(4401, "not-paired");
      return { onMessage: () => {}, onClose: () => {} };
    }
    const ui: UiEntry = { conn, certHash, commandTimes: [] };
    this.uis.add(ui);
    const plugin = certHash ? this.plugins.get(certHash) : undefined;
    conn.send({ v, type: "status", plugin: plugin ? "connected" : "disconnected", ...(certHash ? {} : { preview: true }) });
    this.sendSnapshot(ui);
    return {
      onMessage: (raw: string) => {
        const msg = parse(UiToBridge, raw);
        if (msg?.type === "command") this.command(ui, msg.id, msg.body);
      },
      onClose: () => {
        this.uis.delete(ui);
        for (const [id, p] of this.pending) if (p.ui === ui) this.pending.delete(id);
      },
    };
  }

  private command(ui: UiEntry, id: string, body: CommandBody): void {
    const reply = (result: CommandResult) => ui.conn.send({ v, type: "result", id, result });
    const plugin = ui.certHash ? this.plugins.get(ui.certHash) : undefined;
    if (!plugin) return reply("offline");
    const now = Date.now();
    ui.commandTimes = ui.commandTimes.filter((t) => now - t < 1000);
    if (ui.commandTimes.length >= MAX_COMMANDS_PER_SECOND) return reply("rejected");
    ui.commandTimes.push(now);
    if (body.cmd === "join") {
      const exists = this.state?.channels.some((c) => c.id === body.channel);
      const allowed = this.state?.canEnter.get(plugin.session)?.[String(body.channel)] !== false;
      if (!exists || !allowed) return reply("rejected");
    }
    const pluginId = randomUUID();
    this.pending.set(pluginId, { ui, id, certHash: plugin.certHash });
    plugin.conn.send({ v, type: "command", id: pluginId, body });
  }

  // ---------------------------------------------------------------- intern

  private sendSnapshot(ui: UiEntry): void {
    const s = this.state;
    if (!s) return;
    const plugin = ui.certHash ? this.plugins.get(ui.certHash) : undefined;
    const session = plugin && s.users.some((u) => u.session === plugin.session) ? plugin.session : null;
    const snapshot: Snapshot = {
      v,
      type: "snapshot",
      server: s.info,
      self: session ? { session } : null,
      channels: s.channels,
      // Adressen verlassen den Dienst nie
      users: s.users.map(({ address: _address, ...u }) => ({ ...u, avatar: this.opts.avatarVersion?.(u.userId) ?? null })),
      listeners: s.listeners,
      canEnter: session ? (s.canEnter.get(session) ?? {}) : {},
    };
    ui.conn.send(snapshot);
  }

  private forUis(certHash: string, fn: (ui: UiEntry) => void): void {
    for (const ui of this.uis) if (ui.certHash === certHash) fn(ui);
  }

  private sessionsChanged(): void {
    this.opts.onSessionsChanged?.([...this.plugins.values()].map((p) => p.session));
  }

  private log(msg: string, extra?: Record<string, unknown>): void {
    this.opts.log?.(msg, extra);
  }

  /** verbundene Clients je Version, z. B. `{ "mumble 1.5.735 / plugin 0.4.0": 2 }` (für /healthz) */
  clientVersions(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const p of this.plugins.values()) {
      const key = `mumble ${p.mumbleVersion} / plugin ${p.pluginVersion}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  /** Version des Mumble-Servers (Ice), sobald bekannt */
  get serverVersion(): string | null {
    return this.state?.info.version ?? null;
  }

  get pluginCount(): number {
    return this.plugins.size;
  }
}

/** IPv4-in-IPv6 angleichen (::ffff:1.2.3.4 → 1.2.3.4); Ports kommen in beiden Quellen nicht vor */
function normalize(address: string): string {
  return address.replace(/^::ffff:/, "").trim().toLowerCase();
}

