/**
 * Tube mail (Rohrpost, ADR-0022): the parcels of the own person as the web UI shows them, and the choices of the send
 * dialog. Pure functions without Svelte and without DOM; the state (tube/state.svelte.ts) keeps the result.
 */
import { TUBE_LIMITS, type Parcel, type ParcelRecipient, type Snapshot } from "@ruumble/protocol";

/** the parcels this browser knows, by id: sent and received, also ended ones until they are put away */
export type Parcels = Record<string, Parcel>;

/** a new state of a parcel; a recipient's view keeps only their own line, the service sends it that way */
export function merge(parcels: Parcels, parcel: Parcel): Parcels {
  return { ...parcels, [parcel.id]: parcel };
}

export function without(parcels: Parcels, id: string): Parcels {
  const { [id]: _gone, ...rest } = parcels;
  return rest;
}

/** newest first */
const byTime = (a: Parcel, b: Parcel) => b.at - a.at;

export function outgoing(parcels: Parcels, me: string | null): Parcel[] {
  return Object.values(parcels).filter((p) => p.from === me).sort(byTime);
}

export function incoming(parcels: Parcels, me: string | null): Parcel[] {
  return Object.values(parcels).filter((p) => p.from !== me && mine(p, me)).sort(byTime);
}

/** the own line of a received parcel */
export function mine(parcel: Parcel, me: string | null): ParcelRecipient | null {
  return parcel.recipients.find((r) => r.person === me) ?? null;
}

/** a received parcel that still waits for an answer: offered (or failed and still open) */
export function waiting(parcel: Parcel, me: string | null): boolean {
  const state = mine(parcel, me)?.state;
  return parcel.ended === null && (state === "offered" || state === "failed");
}

/** the number on the button in the top bar: received parcels that wait for an answer */
export function waitingCount(parcels: Parcels, me: string | null): number {
  return incoming(parcels, me).filter((p) => waiting(p, me)).length;
}

/** own parcels on their way: the share already delivered (0…1) over all who did not decline; null: none open */
export function sendingProgress(parcels: Parcels, me: string | null): number | null {
  const open = outgoing(parcels, me).filter((p) => p.ended === null);
  if (!open.length) return null;
  let total = 0;
  let sent = 0;
  for (const p of open) {
    for (const r of p.recipients) {
      if (r.state === "declined") continue;
      total += p.size;
      sent += r.state === "received" ? p.size : r.sent;
    }
  }
  return total ? sent / total : 0;
}

/** an own parcel whose file this tab still has to keep: not ended (the browser asks before the tab closes) */
export function stillNeeded(parcels: Parcels, held: Iterable<string>): boolean {
  for (const id of held) if (parcels[id] && parcels[id].ended === null) return true;
  return false;
}

/** recipients of an own parcel who may still want the file (offered again after a restart of the service) */
export function stillOpen(parcel: Parcel): string[] {
  return parcel.recipients.filter((r) => r.state !== "received" && r.state !== "declined").map((r) => r.person);
}

/** extensions that run programs: a warning before accepting */
const EXECUTABLE = new Set([
  "exe", "msi", "bat", "cmd", "com", "scr", "pif", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta", "cpl",
  "msc", "reg", "lnk", "jar", "sh", "bash", "zsh", "run", "bin", "app", "dmg", "pkg", "deb", "rpm", "appimage", "apk", "py",
]);

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isExecutable(name: string): boolean {
  return EXECUTABLE.has(extension(name));
}

/** the type to show: the extension in capitals, else the media type's subtype, else nothing */
export function typeLabel(name: string, type: string): string {
  const ext = extension(name);
  if (ext && ext.length <= 8) return ext.toUpperCase();
  const sub = type.split("/")[1]?.split(/[;+]/)[0] ?? "";
  return sub && sub.length <= 12 ? sub.toUpperCase() : "";
}

/** someone the own person can send to: with Ruumble, not oneself */
export interface Candidate {
  person: string;
  name: string;
  channelId: number;
  /** the channel's name, for the list */
  place: string;
}

/** everyone with Ruumble apart from the own person, by name */
export function candidates(snapshot: Snapshot | null, me: string | null): Candidate[] {
  if (!snapshot) return [];
  const names = new Map(snapshot.channels.map((c) => [c.id, c.name]));
  return snapshot.users
    .filter((u) => u.person && u.person !== me)
    .map((u) => ({ person: u.person!, name: u.name, channelId: u.channel, place: names.get(u.channel) ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** people in the building without Ruumble: shown greyed, they cannot get tube mail */
export function withoutRuumble(snapshot: Snapshot | null): string[] {
  if (!snapshot) return [];
  return snapshot.users.filter((u) => !u.person && u.session !== snapshot.self?.session).map((u) => u.name).sort((a, b) => a.localeCompare(b));
}

/** a room as a quick choice: its people with Ruumble at this moment */
export interface RoomChoice {
  channelId: number;
  name: string;
  people: string[];
}

/** rooms with someone to send to, the own room first, then by name */
export function roomChoices(list: Candidate[], ownChannel: number | null): RoomChoice[] {
  const rooms = new Map<number, RoomChoice>();
  for (const c of list) {
    const room = rooms.get(c.channelId) ?? { channelId: c.channelId, name: c.place, people: [] };
    room.people.push(c.person);
    rooms.set(c.channelId, room);
  }
  return [...rooms.values()].sort((a, b) => Number(b.channelId === ownChannel) - Number(a.channelId === ownChannel) || a.name.localeCompare(b.name));
}

/** a room chosen: all its people picked; chosen again while all are picked: none of them */
export function toggleRoom(picked: string[], room: RoomChoice): string[] {
  const all = room.people.every((p) => picked.includes(p));
  return all ? picked.filter((p) => !room.people.includes(p)) : [...new Set([...picked, ...room.people])];
}

export function togglePerson(picked: string[], person: string): string[] {
  return picked.includes(person) ? picked.filter((p) => p !== person) : [...picked, person];
}

/** why a file cannot go: empty or too large; null: fine */
export function fileProblem(size: number): "empty" | "too-large" | null {
  return size <= 0 ? "empty" : size > TUBE_LIMITS.fileBytes ? "too-large" : null;
}

/** a new parcel id: 32 hex characters (crypto.randomUUID needs a secure context, plain HTTP in a LAN has none) */
export function newParcelId(random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  return [...random(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
