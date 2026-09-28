/**
 * Polling nach ADR-0002: Grundabfrage jede Sekunde, Mitlauschen alle 3 s, Zutrittsrechte bei
 * Strukturänderung und alle 10 s (nur für gekoppelte Sessions), Servername alle 60 s.
 * Meldet eine Änderung nur, wenn sich der Stand wirklich geändert hat.
 */
import type { Basics, MumbleSource, ServerInfo } from "./mumble.ts";

export interface ServerState extends Basics {
  info: ServerInfo;
  listeners: Record<string, number[]>;
  /** Session → Kanal → false, wenn Zutritt verboten */
  canEnter: Map<number, Record<string, boolean>>;
}

export interface PollerOptions {
  basicMs?: number;
  listenerEvery?: number;
  permissionEvery?: number;
  infoEvery?: number;
  onChange: (state: ServerState) => void;
  onError?: (error: unknown) => void;
  onRestart?: () => void;
  /** nach jeder erfolgreichen Abfrage (Gesundheitsprüfung) */
  onPolled?: () => void;
}

export class Poller {
  private readonly source: MumbleSource;
  private readonly opts: Required<Omit<PollerOptions, "onError" | "onRestart" | "onPolled">> & Pick<PollerOptions, "onError" | "onRestart" | "onPolled">;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tick = 0;
  private lastJson = "";
  private lastStructure = "";
  private sessions = new Set<number>();
  private permissionsDirty = true;
  state: ServerState | null = null;

  constructor(source: MumbleSource, opts: PollerOptions) {
    this.source = source;
    this.opts = { basicMs: 1000, listenerEvery: 3, permissionEvery: 10, infoEvery: 60, ...opts };
  }

  start(): void {
    void this.loop();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Sessions, für die Zutrittsrechte gebraucht werden (gekoppelte Plugins) */
  watchSessions(sessions: Iterable<number>): void {
    const next = new Set(sessions);
    if ([...next].some((s) => !this.sessions.has(s))) this.permissionsDirty = true;
    this.sessions = next;
  }

  /** eine Runde abfragen (öffentlich für Tests) */
  async poll(): Promise<void> {
    const basics = await this.source.basics();
    const prev = this.state;
    if (prev && basics.uptime < prev.uptime) {
      this.opts.onRestart?.();
      this.permissionsDirty = true;
    }
    const channelIds = basics.channels.map((c) => c.id);
    const structure = JSON.stringify(basics.channels);
    if (structure !== this.lastStructure) this.permissionsDirty = true;
    this.lastStructure = structure;

    const info = !prev || this.tick % this.opts.infoEvery === 0 ? await this.source.serverInfo() : prev.info;
    const listeners = !prev || this.tick % this.opts.listenerEvery === 0 ? await this.source.listeners(channelIds) : prev.listeners;
    let canEnter = prev?.canEnter ?? new Map<number, Record<string, boolean>>();
    const livingSessions = new Set(basics.users.map((u) => u.session));
    if (this.permissionsDirty || this.tick % this.opts.permissionEvery === 0 || [...this.sessions].some((s) => livingSessions.has(s) && !canEnter.has(s))) {
      canEnter = new Map();
      for (const s of this.sessions) if (livingSessions.has(s)) canEnter.set(s, await this.source.canEnter(s, channelIds));
      this.permissionsDirty = false;
    }
    this.tick++;
    this.opts.onPolled?.();

    this.state = { ...basics, info, listeners, canEnter };
    const json = JSON.stringify({ ...this.state, uptime: 0, canEnter: [...canEnter] });
    if (json !== this.lastJson) {
      this.lastJson = json;
      this.opts.onChange(this.state);
    }
  }

  private async loop(): Promise<void> {
    const started = Date.now();
    try {
      await this.poll();
    } catch (e) {
      this.opts.onError?.(e);
    }
    this.timer = setTimeout(() => void this.loop(), Math.max(0, this.opts.basicMs - (Date.now() - started)));
  }
}
