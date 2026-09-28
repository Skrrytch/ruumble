/**
 * building-model: leitet aus einem Mumble-Snapshot das Gebäude ab (PLANUNG Abschnitt 2, ADR-0007).
 * Reine Funktionen ohne Svelte und ohne DOM. Jede Änderung am Snapshot ergibt ein neues Gebäude,
 * gespeichert wird nichts.
 */
import type { Channel, Snapshot, User } from "@ruumble/protocol";

/** Mehr Räume passen nicht sinnvoll auf eine Etage (PLANUNG 2.3). */
export const MAX_ROOMS = 8;

/** Ab so vielen Minuten ohne Sprechen gilt jemand als still (E30). Ice idlesecs zählt nur Sprechen. */
export const QUIET_MINUTES = 15;
/** Selbst taub und mindestens so viele Minuten still: abwesend (E30). */
export const AWAY_MINUTES = 5;

export type Presence = "active" | "quiet" | "away";

export type LockReason = "too-deep" | "too-many-rooms";

export interface UserView {
  session: number;
  name: string;
  initials: string;
  isSelf: boolean;
  /** selbst stumm oder taub geschaltet */
  selfMuted: boolean;
  selfDeafened: boolean;
  /** vom Server stummgeschaltet, taub geschaltet oder unterdrückt (Symbolik: O6) */
  serverMuted: boolean;
  /** Avatarbild (AP9), `null`: Initialen */
  avatarUrl: string | null;
  /** Anwesenheit ohne Berücksichtigung des Sprechens; wer spricht, zeigt die Oberfläche immer als aktiv (AP10) */
  presence: Presence;
  idleMinutes: number;
  recording: boolean;
}

/** Ein betretbarer Bereich: Raum, Flur oder offene Etage. */
export interface Space {
  channelId: number;
  name: string;
  users: UserView[];
  isSelf: boolean;
  /** Der eigene Nutzer darf den Kanal nicht betreten (ADR-0003). */
  locked: boolean;
  /** Sessions, die hier mitlauschen */
  listeners: number[];
  /** Jemand im Raum zeichnet auf (AP10) */
  recording: boolean;
}

export interface Room extends Space {
  /** Name enthält „(stumm)“ */
  muted: boolean;
  /** flex-grow nach Rang in der Mumble-Reihenfolge (roomGrow) */
  grow: number;
}

export interface Floor {
  channelId: number;
  name: string;
  level: string;
  badge: string;
  /** Der Etagenkanal selbst: Flur, bei einer Etage ohne Räume die offene Etage */
  corridor: Space;
  rooms: Room[];
  /** nur ohne Räume: offene Etage */
  open: boolean;
  lock: LockReason | null;
  /** alle Nutzer im sichtbaren Teilbaum der Etage */
  population: number;
  isSelf: boolean;
}

export type SelfLocation =
  | { kind: "room" | "corridor" | "open-floor"; floorId: number; channelId: number }
  | { kind: "locked-floor"; floorId: number; channelId: number }
  | { kind: "entrance" }
  /** in einem ausgeblendeten (verlinkten) Kanal */
  | { kind: "hidden"; channelId: number };

export interface Building {
  name: string;
  serverVersion: string;
  floors: Floor[];
  /** Nutzer im Root-Kanal */
  entrance: UserView[];
  /** alle Nutzer auf dem Server, auch in ausgeblendeten Kanälen */
  online: number;
  /** `null`, solange kein gekoppeltes Plugin verbunden ist */
  self: SelfLocation | null;
}

// ---------------------------------------------------------------- einzelne Regeln

const collator = new Intl.Collator("de");

/** Geschwisterkanäle wie im Mumble-Client: nach `position`, dann nach Name (Analyse 3.3). */
export function sortSiblings<T extends Pick<Channel, "position" | "name">>(channels: readonly T[]): T[] {
  return [...channels].sort((a, b) => a.position - b.position || collator.compare(a.name, b.name));
}

/**
 * Sichtbare Kanäle: Verlinkte Kanäle verschwinden samt allen Unterkanälen (PLANUNG 2.4, O2, O3).
 * Der Root-Kanal ist immer sichtbar.
 */
export function visibleChannels(channels: readonly Channel[]): Channel[] {
  const byId = new Map(channels.map((c) => [c.id, c]));
  const hidden = (c: Channel): boolean => {
    for (let cur: Channel | undefined = c; cur && cur.parent !== null; cur = byId.get(cur.parent)) {
      if (cur.links.length > 0) return true;
    }
    return false;
  };
  return channels.filter((c) => !hidden(c));
}

/**
 * Breite nach Rang in der Mumble-Reihenfolge (SPEC 2): Raum 1 und 2 sind groß,
 * danach werden die Räume schrittweise kleiner (1,1 bis 0,85).
 */
export function roomGrow(index: number): number {
  if (index < 2) return 1.3;
  return Math.round(Math.max(0.85, 1.1 - (index - 2) * 0.05) * 100) / 100;
}

/**
 * Oben stehen die großen Räume, deshalb bekommt die untere Reihe bei ungerader Anzahl
 * einen Raum mehr (SPEC 2). Ein einzelner Raum steht oben.
 */
export function splitRows<T>(rooms: readonly T[]): { top: T[]; bottom: T[] } {
  const top = Math.max(Math.min(rooms.length, 1), Math.floor(rooms.length / 2));
  return { top: rooms.slice(0, top), bottom: rooms.slice(top) };
}

/** Etagen mit höchstens so vielen Räumen werden schmaler, wenn die Pinnwand offen ist */
export const FEW_ROOMS = 2;

const segmenter = new Intl.Segmenter("de", { granularity: "grapheme" });

/** Die ersten zwei Zeichen (Grapheme) des Namens, Emojis und Akzente bleiben ganz. */
export function initials(name: string): string {
  return [...segmenter.segment(name.trim())].slice(0, 2).map((s) => s.segment).join("");
}

/** „frei“ / „1 Person“ / „N Personen“ */
export function countText(n: number): string {
  return n === 0 ? "frei" : n === 1 ? "1 Person" : `${n} Personen`;
}

export function isMutedRoomName(name: string): boolean {
  return /\(stumm\)/i.test(name);
}

export function presenceOf(u: Pick<User, "selfDeaf" | "idleMinutes">): Presence {
  if (u.selfDeaf && u.idleMinutes >= AWAY_MINUTES) return "away";
  if (u.idleMinutes >= QUIET_MINUTES) return "quiet";
  return "active";
}

/** Standard: Bild vom Dienst, versioniert (AP9) */
const defaultAvatarUrl = (userId: number, version: string) => `/avatar/${userId}?v=${version}`;

export interface BuildOptions {
  avatarUrl?: (userId: number, version: string) => string;
}

export function floorLabels(index: number): { level: string; badge: string } {
  return index === 0 ? { level: "Erdgeschoss", badge: "EG" } : { level: `${index}. Obergeschoss`, badge: String(index) };
}

// ---------------------------------------------------------------- Gebäude

export function buildBuilding(snapshot: Snapshot, options: BuildOptions = {}): Building {
  const avatarUrl = options.avatarUrl ?? defaultAvatarUrl;
  const selfSession = snapshot.self?.session ?? null;
  const visible = visibleChannels(snapshot.channels);
  const visibleIds = new Set(visible.map((c) => c.id));
  const children = new Map<number, Channel[]>();
  for (const c of visible) {
    if (c.parent === null) continue;
    children.set(c.parent, [...(children.get(c.parent) ?? []), c]);
  }
  const childrenOf = (id: number) => sortSiblings(children.get(id) ?? []);

  const usersIn = new Map<number, User[]>();
  for (const u of snapshot.users) usersIn.set(u.channel, [...(usersIn.get(u.channel) ?? []), u]);
  const userView = (u: User): UserView => ({
    session: u.session,
    name: u.name,
    initials: initials(u.name),
    isSelf: u.session === selfSession,
    selfMuted: u.selfMute || u.selfDeaf,
    selfDeafened: u.selfDeaf,
    serverMuted: u.mute || u.deaf || u.suppress,
    avatarUrl: u.userId !== null && u.avatar ? avatarUrl(u.userId, u.avatar) : null,
    presence: presenceOf(u),
    idleMinutes: u.idleMinutes,
    recording: u.recording,
  });
  const viewsIn = (id: number) =>
    (usersIn.get(id) ?? []).slice().sort((a, b) => collator.compare(a.name, b.name)).map(userView);

  const selfUser = snapshot.users.find((u) => u.session === selfSession);
  const space = (c: Channel): Space => ({
    channelId: c.id,
    name: c.name,
    users: viewsIn(c.id),
    isSelf: selfUser?.channel === c.id,
    locked: snapshot.canEnter[String(c.id)] === false,
    listeners: snapshot.listeners[String(c.id)] ?? [],
    recording: (usersIn.get(c.id) ?? []).some((u) => u.recording),
  });
  const subtreePopulation = (id: number): number =>
    (usersIn.get(id)?.length ?? 0) + childrenOf(id).reduce((n, c) => n + subtreePopulation(c.id), 0);
  const subtreeIds = (id: number): number[] => [id, ...childrenOf(id).flatMap((c) => subtreeIds(c.id))];

  const floors: Floor[] = childrenOf(0).map((f, index) => {
    const roomChannels = childrenOf(f.id);
    const lock: LockReason | null = roomChannels.some((r) => childrenOf(r.id).length > 0)
      ? "too-deep"
      : roomChannels.length > MAX_ROOMS
        ? "too-many-rooms"
        : null;
    return {
      channelId: f.id,
      name: f.name,
      ...floorLabels(index),
      corridor: space(f),
      rooms: roomChannels.map((r, i) => ({
        ...space(r),
        muted: isMutedRoomName(r.name),
        grow: roomGrow(i),
      })),
      open: roomChannels.length === 0,
      lock,
      population: subtreePopulation(f.id),
      isSelf: selfUser !== undefined && subtreeIds(f.id).includes(selfUser.channel),
    };
  });

  let self: SelfLocation | null = null;
  if (selfUser) {
    const ch = selfUser.channel;
    const floor = floors.find((f) => f.isSelf);
    if (ch === 0) self = { kind: "entrance" };
    else if (!visibleIds.has(ch) || !floor) self = { kind: "hidden", channelId: ch };
    else if (floor.lock) self = { kind: "locked-floor", floorId: floor.channelId, channelId: ch };
    else if (floor.channelId === ch) self = { kind: floor.open ? "open-floor" : "corridor", floorId: floor.channelId, channelId: ch };
    else self = { kind: "room", floorId: floor.channelId, channelId: ch };
  }

  return {
    name: snapshot.server.name,
    serverVersion: snapshot.server.version,
    floors,
    entrance: viewsIn(0),
    online: snapshot.users.length,
    self,
  };
}

/** Welche Etage beim Start bzw. bei „Zu meiner Etage“ angezeigt wird: die eigene, sonst die erste darstellbare. */
export function homeFloor(building: Building): Floor | null {
  const own = building.floors.find((f) => f.isSelf);
  return own ?? building.floors.find((f) => !f.lock) ?? null;
}
