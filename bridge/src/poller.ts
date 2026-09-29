/**
 * Polling per ADR-0002: basic query every second, listening every 3 s, access permissions on
 * structure change and every 10 s (only for paired sessions), server name every 60 s.
 * Reports a change only when the state has really changed.
 */
import type { Basics, MumbleSource, ServerInfo } from "./mumble.ts";

export interface ServerState extends Basics {
  info: ServerInfo;
  listeners: Record<string, number[]>;
  /** session → channel → false if access is denied */
  canEnter: Map<number, Record<string, boolean>>;
}

/** polling rate: base rate 1 s, listeners every 3, permissions every 10, server info every 60 rounds (ADR-0002) */
const BASIC_MS = 1000;
const LISTENER_EVERY = 3;
const PERMISSION_EVERY = 10;
const INFO_EVERY = 60;

export interface PollerOptions {
  onChange: (state: ServerState) => void;
  onError?: (error: unknown) => void;
  onRestart?: () => void;
  /** after every successful query (health check) */
  onPolled?: () => void;
}

export class Poller {
  private readonly source: MumbleSource;
  private readonly opts: PollerOptions;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tick = 0;
  private lastJson = "";
  private lastStructure = "";
  private sessions = new Set<number>();
  private permissionsDirty = true;
  state: ServerState | null = null;

  constructor(source: MumbleSource, opts: PollerOptions) {
    this.source = source;
    this.opts = opts;
  }

  start(): void {
    void this.loop();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** sessions for which access permissions are needed (paired plugins) */
  watchSessions(sessions: Iterable<number>): void {
    const next = new Set(sessions);
    if ([...next].some((s) => !this.sessions.has(s))) this.permissionsDirty = true;
    this.sessions = next;
  }

  /** poll one round (timer from `start()`, also immediately on request by the hub and in tests) */
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

    const info = !prev || this.tick % INFO_EVERY === 0 ? await this.source.serverInfo() : prev.info;
    const listeners = !prev || this.tick % LISTENER_EVERY === 0 ? await this.source.listeners(channelIds) : prev.listeners;
    let canEnter = prev?.canEnter ?? new Map<number, Record<string, boolean>>();
    const livingSessions = new Set(basics.users.map((u) => u.session));
    if (this.permissionsDirty || this.tick % PERMISSION_EVERY === 0 || [...this.sessions].some((s) => livingSessions.has(s) && !canEnter.has(s))) {
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
    this.timer = setTimeout(() => void this.loop(), Math.max(0, BASIC_MS - (Date.now() - started)));
  }
}
