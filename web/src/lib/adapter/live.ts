/**
 * LiveAdapter: WebSocket zum Ruumble-Dienst (`/ws/ui`, ADR-0007).
 * Verbindet sich bei Abbruch mit wachsendem Abstand neu. Ergebnisse werden den Befehlen über die ID zugeordnet.
 */
import { BoardView, BridgeToUi, PROTOCOL_VERSION, Post, parse, type CommandBody, type CommandResult, type Parser } from "@ruumble/protocol";
import type { AdapterEvents, BoardApi, BoardErrorCode, BoardResult, MumbleAdapter } from "./types.ts";

/** REST der Pinnwand; Cookie der Kopplung geht automatisch mit (same-origin) */
async function call<T>(schema: Parser<T> | null, url: string, init: RequestInit = {}): Promise<BoardResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", ...init, headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers } });
  } catch {
    return { ok: false, error: "offline" };
  }
  if (res.status === 204) return { ok: true, value: true as T };
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: ((body as { error?: BoardErrorCode } | null)?.error ?? "invalid") };
  const parsed = schema ? schema.safeParse(body) : { success: true as const, data: body as T };
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "invalid" };
}

export const liveBoard: BoardApi = {
  load: () => call(BoardView, "/api/board"),
  create: (post) => call(Post, "/api/board/posts", { method: "POST", body: JSON.stringify(post) }),
  update: (id, change) => call(Post, `/api/board/posts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(change) }),
  remove: (id) => call<true>(null, `/api/board/posts/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

/** Ohne Antwort des Plugins gilt ein Befehl nach dieser Zeit als `timeout` (Plugin: 3 s + Wiederholung). */
const COMMAND_TIMEOUT_MS = 10_000;

export class LiveAdapter implements MumbleAdapter {
  private readonly url: string;
  private events: AdapterEvents | null = null;
  private socket: WebSocket | null = null;
  private retryMs = 500;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pending = new Map<string, { resolve: (r: CommandResult) => void; timer: ReturnType<typeof setTimeout> }>();
  private nextId = 1;
  readonly board: BoardApi = liveBoard;

  constructor(url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/ui`) {
    this.url = url;
  }

  start(events: AdapterEvents): void {
    this.events = events;
    this.open();
  }

  stop(): void {
    this.events = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close();
  }

  command(body: CommandBody): Promise<CommandResult> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.resolve("offline");
    const id = `c${this.nextId++}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve("timeout");
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(id, { resolve, timer });
      socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: "command", id, body }));
    });
  }

  private open(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => (this.retryMs = 500);
    socket.onmessage = (e) => {
      const msg = parse(BridgeToUi, String(e.data));
      if (!msg || !this.events) return;
      switch (msg.type) {
        case "snapshot":
          return this.events.snapshot(msg);
        case "talking":
          return this.events.talking(msg.session, msg.state);
        case "status":
          return this.events.status(msg.plugin, msg.preview ?? false);
        case "board":
          return this.events.board(msg.channelId);
        case "result": {
          const p = this.pending.get(msg.id);
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(msg.id);
            p.resolve(msg.result);
          }
        }
      }
    };
    socket.onclose = (e) => {
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.resolve("offline");
        this.pending.delete(id);
      }
      if (!this.events) return;
      if (e.code === 4401) return this.events.connection("unpaired"); // nicht gekoppelt: kein erneuter Versuch
      this.events.connection("reconnecting");
      this.retryTimer = setTimeout(() => this.open(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 10_000);
    };
  }
}
