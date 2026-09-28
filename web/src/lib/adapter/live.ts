/**
 * LiveAdapter: WebSocket zum Ruumble-Dienst (`/ws/ui`, ADR-0007).
 * Verbindet sich bei Abbruch mit wachsendem Abstand neu. Ergebnisse werden den Befehlen über die ID zugeordnet.
 */
import { BridgeToUi, PROTOCOL_VERSION, parse, type CommandBody, type CommandResult } from "@ruumble/protocol";
import type { AdapterEvents, MumbleAdapter } from "./types.ts";

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
