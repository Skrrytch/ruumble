import type { Channel } from "@ruumble/protocol";
import type { Basics, MumbleSource } from "../src/mumble.ts";

/** Fake Mumble server for poller and hub tests */
export class FakeSource implements MumbleSource {
  calls: string[] = [];
  channels: Channel[] = [
    { id: 0, parent: null, name: "Root", position: 0, links: [], temporary: false },
    { id: 1, parent: 0, name: "1F", position: 0, links: [], temporary: false },
    { id: 2, parent: 1, name: "Office", position: 0, links: [], temporary: false },
    { id: 3, parent: 1, name: "Secret", position: 1, links: [], temporary: false },
  ];
  users: Basics["users"] = [
    { session: 7, name: "Anna", channel: 1, selfMute: false, selfDeaf: false, mute: false, deaf: false, suppress: false, userId: 1, avatar: null, idleMinutes: 0, recording: false, address: "10.0.0.7" },
    { session: 8, name: "Ben", channel: 2, selfMute: false, selfDeaf: false, mute: false, deaf: false, suppress: false, userId: null, avatar: null, idleMinutes: 3, recording: true, address: "10.0.0.8" },
  ];
  uptime = 100;
  hashes: Record<number, string> = { 7: "a".repeat(40), 8: "b".repeat(40) };
  denied: Record<number, number[]> = { 7: [3] };

  async basics() { this.calls.push("basics"); return structuredClone({ channels: this.channels, users: this.users, uptime: this.uptime }); }
  async serverInfo() { this.calls.push("info"); return { name: "House", version: "1.6.870" }; }
  async listeners() { this.calls.push("listeners"); return {}; }
  async canEnter(session: number, ids: number[]) {
    this.calls.push(`canEnter:${session}`);
    return Object.fromEntries(ids.filter((id) => this.denied[session]?.includes(id)).map((id) => [String(id), false]));
  }
  async certHash(session: number) { return this.hashes[session] ?? null; }
  /** Write everywhere (admins) or only on these channels */
  admins = new Set<number>();
  writeOn: Record<number, number[]> = {};
  async canWrite(session: number, channelId: number) { return this.admins.has(session) || !!this.writeOn[session]?.includes(channelId); }
  textures: Record<number, Uint8Array> = {};
  async texture(userId: number) { return this.textures[userId] ?? null; }
  async close() {}
}

/** Connection that collects sent messages */
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
