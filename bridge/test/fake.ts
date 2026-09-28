import type { Channel } from "@ruumble/protocol";
import type { Basics, MumbleSource } from "../src/mumble.ts";

/** Gefälschter Mumble-Server für Tests von Poller und Hub */
export class FakeSource implements MumbleSource {
  calls: string[] = [];
  channels: Channel[] = [
    { id: 0, parent: null, name: "Root", position: 0, links: [], temporary: false },
    { id: 1, parent: 0, name: "OG", position: 0, links: [], temporary: false },
    { id: 2, parent: 1, name: "Büro", position: 0, links: [], temporary: false },
    { id: 3, parent: 1, name: "Geheim", position: 1, links: [], temporary: false },
  ];
  users: Basics["users"] = [
    { session: 7, name: "Anna", channel: 1, selfMute: false, selfDeaf: false, mute: false, deaf: false, suppress: false, address: "10.0.0.7" },
    { session: 8, name: "Ben", channel: 2, selfMute: false, selfDeaf: false, mute: false, deaf: false, suppress: false, address: "10.0.0.8" },
  ];
  uptime = 100;
  hashes: Record<number, string> = { 7: "a".repeat(40), 8: "b".repeat(40) };
  denied: Record<number, number[]> = { 7: [3] };

  async basics() { this.calls.push("basics"); return structuredClone({ channels: this.channels, users: this.users, uptime: this.uptime }); }
  async serverInfo() { this.calls.push("info"); return { name: "Haus", version: "1.6.870" }; }
  async listeners() { this.calls.push("listeners"); return {}; }
  async canEnter(session: number, ids: number[]) {
    this.calls.push(`canEnter:${session}`);
    return Object.fromEntries(ids.filter((id) => this.denied[session]?.includes(id)).map((id) => [String(id), false]));
  }
  async certHash(session: number) { return this.hashes[session] ?? null; }
  async close() {}
}

/** Verbindung, die gesendete Nachrichten sammelt */
export function recorder<T>() {
  const sent: T[] = [];
  let closed: { code: number; reason: string } | null = null;
  return {
    sent,
    get closed() { return closed; },
    conn: { send: (m: T) => void sent.push(m), close: (code: number, reason: string) => void (closed = { code, reason }) },
    last: <K extends string>(type: K) => [...sent].reverse().find((m) => (m as { type: string }).type === type) as Extract<T, { type: K }> | undefined,
  };
}
