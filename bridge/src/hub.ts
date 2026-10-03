/**
 * Mediation between plugins and web UIs (ADR-0001, -0003, -0004, -0005, -0007).
 * Transport-independent: connections are just objects with `send` and `close`.
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
import { pairingCodeText, type Pairing } from "./pairing.ts";
import type { ServerState } from "./poller.ts";

export interface Conn<T> {
  send(msg: T): void;
  close(code: number, reason: string): void;
}

export type AddressCheck = "off" | "warn" | "enforce";

export interface HubOptions {
  source: MumbleSource;
  pairing: Pairing;
  /** public base URL for pairing links, e.g. https://ruumble.example; unset: the address the plugin connected to */
  publicUrl?: string;
  addressCheck: AddressCheck;
  /** preview: web UIs without pairing see the building read-only */
  preview: boolean;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
  onSessionsChanged?: (sessions: number[]) => void;
  /** re-query immediately, e.g. when a plugin reports a session the polling does not know yet */
  refresh?: () => Promise<void>;
  /** version of a registered user's avatar image (AP9) */
  avatarVersion?: (userId: number | null) => string | null;
}

/** Who is behind a device token and where are they right now? (board, ADR-0011) */
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
  /** Mumble client and plugin as reported by the plugin (operations, compatibility) */
  mumbleVersion: string;
  pluginVersion: string;
  locale: Locale;
  /** source address of the plugin connection (pairing with a code, ADR-0012) */
  remoteAddress: string;
}

/** abuse protection per user; the plugin handles the Mumble limits (ADR-0003) */
const MAX_COMMANDS_PER_SECOND = 5;

interface UiEntry {
  conn: Conn<BridgeToUi>;
  certHash: string | null;
  /** public name of the device token it connected with (key cabinet, ADR-0015) */
  keyId: string | null;
  commandTimes: number[];
}

const v = PROTOCOL_VERSION;

export class Hub {
  private readonly opts: HubOptions;
  private state: ServerState | null = null;
  private readonly plugins = new Map<string, PluginEntry>();
  private readonly uis = new Set<UiEntry>();
  /** command ID in the plugin → web UI and its ID */
  private readonly pending = new Map<string, { ui: UiEntry; id: string; certHash: string }>();

  constructor(opts: HubOptions) {
    this.opts = opts;
  }

  // ---------------------------------------------------------------- Server state

  setState(state: ServerState): void {
    this.state = state;
    this.rebroadcast();
  }

  /** resend snapshots, e.g. after a new avatar image */
  rebroadcast(): void {
    for (const ui of this.uis) this.sendSnapshot(ui);
  }

  /** paired user with a connected plugin and their current channel; otherwise `null` */
  whoIs(certHash: string | null): Viewer | null {
    const plugin = certHash ? this.plugins.get(certHash) : undefined;
    const user = plugin && this.state?.users.find((u) => u.session === plugin.session);
    return plugin && user ? { certHash: plugin.certHash, session: plugin.session, name: user.name, channelId: user.channel } : null;
  }

  /** Is this channel a room with a board? 2nd level, not temporary (ADR-0011) */
  isBoardRoom(channelId: number): boolean {
    const channels = this.state?.channels ?? [];
    const c = channels.find((x) => x.id === channelId);
    const floor = c && c.parent !== null ? channels.find((x) => x.id === c.parent) : undefined;
    return !!c && !c.temporary && !!floor && floor.parent === 0;
  }

  /** Is this channel a floor? A child of the root channel (care, ADR-0014) */
  isFloor(channelId: number): boolean {
    return !!this.state?.channels.some((c) => c.id === channelId && c.parent === 0);
  }

  /** floors (children of the root channel) with their rooms that can have a board, in Mumble's order */
  floorPlan(): { id: number; name: string; rooms: { id: number; name: string }[] }[] {
    const channels = this.state?.channels ?? [];
    const order = (a: { position: number; name: string }, b: { position: number; name: string }) => a.position - b.position || a.name.localeCompare(b.name, "de");
    return channels
      .filter((c) => c.parent === 0)
      .sort(order)
      .map((f) => ({ id: f.id, name: f.name, rooms: channels.filter((c) => c.parent === f.id && !c.temporary).sort(order).map((r) => ({ id: r.id, name: r.name })) }));
  }

  /** current floor of a room with a board, null otherwise */
  floorOf(channelId: number): number | null {
    return this.isBoardRoom(channelId) ? (this.state?.channels.find((c) => c.id === channelId)?.parent ?? null) : null;
  }

  /** may this user enter the channel (Mumble ACLs, as for moving); unknown counts as yes, like in the snapshot */
  mayEnter(session: number, channelId: number): boolean {
    return this.state?.canEnter.get(session)?.[String(channelId)] !== false;
  }

  channelName(channelId: number): string {
    return this.state?.channels.find((c) => c.id === channelId)?.name ?? "";
  }

  /** inform those present in a room about a board change (without content, the web UI reloads) */
  boardChanged(channelId: number): void {
    for (const ui of this.uis) {
      if (this.whoIs(ui.certHash)?.channelId === channelId) ui.conn.send({ v, type: "board", channelId });
    }
  }

  /** plugins of those present in a room (except `except`) – for notices in the Mumble log */
  pluginsIn(channelId: number, except?: string): { send: (msg: BridgeToPlugin) => void; locale: Locale }[] {
    return [...this.plugins.values()]
      .filter((p) => p.certHash !== except && this.state?.users.find((u) => u.session === p.session)?.channel === channelId)
      .map((p) => ({ send: (msg: BridgeToPlugin) => p.conn.send(msg), locale: p.locale }));
  }

  /**
   * A browser at `address` wants to pair (ADR-0012): every plugin from the same address, or whose
   * Mumble user has it, gets its own code in the Mumble log.
   */
  requestPairing(address: string, now = Date.now()): { request: string } | "no-plugin" | "rate-limited" {
    const a = normalize(address);
    const targets = [...this.plugins.values()].filter((p) => {
      const user = this.state?.users.find((u) => u.session === p.session);
      return normalize(p.remoteAddress) === a || (!!user && normalize(user.address) === a);
    });
    const name = (p: PluginEntry) => this.state?.users.find((u) => u.session === p.session)?.name ?? "";
    const result = this.opts.pairing.requestCodes(a, targets.map((p) => ({ certHash: p.certHash, name: name(p) })), now);
    if (typeof result === "string") return result;
    for (const { certHash, code } of result.codes) {
      const p = this.plugins.get(certHash)!;
      p.conn.send({ v, type: "notify", text: pairingCodeText(code, p.locale) });
    }
    this.log("Pairing code requested", { plugins: result.codes.length });
    return { request: result.request };
  }

  /** May this web UI see images and data? (paired or preview, ADR-0004) */
  canView(certHash: string | null): boolean {
    return certHash !== null || this.opts.preview;
  }

  /** a key was revoked: web UIs connected with it become unpaired (ADR-0015) */
  keyRevoked(keyId: string): void {
    for (const ui of [...this.uis]) if (ui.keyId === keyId) ui.conn.close(4401, "not-paired");
  }

  /** Virtual server restarted: sessions are reassigned, plugins register again (S2). */
  serverRestarted(): void {
    for (const p of [...this.plugins.values()]) p.conn.close(4000, "server-restart");
  }

  // ---------------------------------------------------------------- Plugin

  /** `baseUrl`: the address the plugin reached the service at (the users' address), for pairing links without publicUrl */
  pluginConnected(conn: Conn<BridgeToPlugin>, remoteAddress: string, baseUrl = "") {
    let entry: PluginEntry | null = null;
    return {
      onMessage: async (raw: string) => {
        const msg = parse(PluginToBridge, raw);
        if (!msg) return;
        if (msg.type === "hello") {
          const verdict = await this.verify(msg.session, msg.certHash, remoteAddress);
          if (verdict !== "ok") {
            this.log("Plugin rejected", { reason: verdict, session: msg.session });
            conn.send({ v, type: "reject", reason: verdict });
            conn.close(4403, verdict);
            return;
          }
          const name = this.state?.users.find((u) => u.session === msg.session)?.name ?? "";
          const previous = this.plugins.get(msg.certHash);
          if (previous && previous.conn !== conn) previous.conn.close(4001, "replaced");
          if (entry && entry.certHash !== msg.certHash) this.removePlugin(entry);
          entry = { conn, certHash: msg.certHash, session: msg.session, mumbleVersion: msg.mumbleVersion ?? "unknown", pluginVersion: msg.pluginVersion, locale: msg.locale ?? "de", remoteAddress };
          this.plugins.set(msg.certHash, entry);
          const pairUrl = msg.paired ? undefined : `${this.opts.publicUrl ?? baseUrl}/pair?code=${this.opts.pairing.createCode(msg.certHash, name)}`;
          conn.send(pairUrl ? { v, type: "welcome", pairUrl } : { v, type: "welcome" });
          this.log("Plugin connected", { session: msg.session, name, plugin: msg.pluginVersion, mumble: entry.mumbleVersion });
          this.sessionsChanged();
          this.forUis(msg.certHash, (ui) => {
            ui.conn.send({ v, type: "status", plugin: "connected" });
            this.sendSnapshot(ui);
          });
          return;
        }
        if (!entry) return; // everything else only after a successful hello
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
            // immediate feedback without waiting for the next Ice sync
            const u = this.state?.users.find((x) => x.session === entry!.session);
            if (u && (u.selfMute !== msg.selfMute || u.selfDeaf !== msg.selfDeaf)) {
              u.selfMute = msg.selfMute;
              u.selfDeaf = msg.selfDeaf;
              this.rebroadcast();
            }
            break;
          }
          case "talking":
            // only to the user's own web UIs (ADR-0005)
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
      // The plugin registers right after the sync, often before the next query (live test)
      await this.opts.refresh().catch(() => {});
      user = this.state?.users.find((u) => u.session === session);
    }
    if (!user) return "unknown-session";
    const hash = await this.opts.source.certHash(session);
    if (!hash) return "no-certificate";
    if (hash !== certHash) return "hash-mismatch";
    if (this.opts.addressCheck !== "off" && normalize(remoteAddress) !== normalize(user.address)) {
      this.log("Plugin address does not match Mumble's", { session, plugin: remoteAddress, mumble: user.address });
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
    this.log("Plugin disconnected", { session: entry.session });
    this.sessionsChanged();
    this.forUis(entry.certHash, (ui) => {
      ui.conn.send({ v, type: "status", plugin: "disconnected" });
      this.sendSnapshot(ui);
    });
  }

  // ---------------------------------------------------------------- Web UI

  /** `certHash = null`: unpaired (only allowed in preview); `keyId`: the device token's public name */
  uiConnected(conn: Conn<BridgeToUi>, certHash: string | null, keyId: string | null = null) {
    if (!certHash && !this.opts.preview) {
      conn.close(4401, "not-paired");
      return { onMessage: () => {}, onClose: () => {} };
    }
    const ui: UiEntry = { conn, certHash, keyId, commandTimes: [] };
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
      const allowed = this.mayEnter(plugin.session, body.channel);
      if (!exists || !allowed) return reply("rejected");
    }
    const pluginId = randomUUID();
    this.pending.set(pluginId, { ui, id, certHash: plugin.certHash });
    plugin.conn.send({ v, type: "command", id: pluginId, body });
  }

  // ---------------------------------------------------------------- internal

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
      // addresses never leave the service
      users: s.users.map(({ address: _address, ...u }) => ({ ...u, avatar: this.opts.avatarVersion?.(u.userId) ?? null })),
      listeners: s.listeners,
      canEnter: session ? (s.canEnter.get(session) ?? {}) : {},
      care: session ? (s.care.get(session) ?? []) : [],
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

  /** connected clients per version, e.g. `{ "mumble 1.5.735 / plugin 0.4.0": 2 }` (for /healthz) */
  clientVersions(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const p of this.plugins.values()) {
      const key = `mumble ${p.mumbleVersion} / plugin ${p.pluginVersion}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  /** version of the Mumble server (Ice), once known */
  get serverVersion(): string | null {
    return this.state?.info.version ?? null;
  }

  get pluginCount(): number {
    return this.plugins.size;
  }
}

/** normalise IPv4-in-IPv6 (::ffff:1.2.3.4 → 1.2.3.4); neither source includes ports */
function normalize(address: string): string {
  return address.replace(/^::ffff:/, "").trim().toLowerCase();
}

