/**
 * building-model: derives the building from a Mumble snapshot (building rules in docs/internal/charter.md, ADR-0007).
 * Pure functions without Svelte and without DOM. Every change to the snapshot yields a new building,
 * nothing is stored.
 */
import type { Channel, Snapshot, User } from "@ruumble/protocol";
import { t } from "../i18n/index.svelte.ts";

/** Rooms per row in view (6 on a floor); more scroll sideways (docs/internal/charter.md, E31). */
export const ROOMS_IN_VIEW = 3;

/** After this many minutes without talking someone counts as quiet (E30). Ice idlesecs only counts talking. */
export const QUIET_MINUTES = 15;
/** Self-deafened and quiet for at least this many minutes: away (E30). */
export const AWAY_MINUTES = 5;

export type Presence = "active" | "quiet" | "away";

export type LockReason = "too-deep";

export interface UserView {
  session: number;
  name: string;
  initials: string;
  isSelf: boolean;
  /** self-muted or self-deafened */
  selfMuted: boolean;
  selfDeafened: boolean;
  /** muted, deafened or suppressed by the server (symbols: O6) */
  serverMuted: boolean;
  /** Avatar image (AP9), `null`: initials */
  avatarUrl: string | null;
  /** Presence without regard to talking; whoever is talking is always shown as active by the web UI (AP10) */
  presence: Presence;
  idleMinutes: number;
  recording: boolean;
}

/** An enterable area: room, corridor or open floor. */
export interface Space {
  channelId: number;
  name: string;
  users: UserView[];
  isSelf: boolean;
  /** The own user may not enter the channel (ADR-0003). */
  locked: boolean;
  /** Sessions listening here */
  listeners: number[];
  /** Someone in the room is recording (AP10) */
  recording: boolean;
  /** The own user may tend its stored data: the plant is a button (Mumble Write, ADR-0014) */
  canTend: boolean;
}

export interface Room extends Space {
  /** Name contains “(stumm)” */
  muted: boolean;
  /** flex-grow by the number of people in it (roomGrow) */
  grow: number;
}

export interface Floor {
  channelId: number;
  name: string;
  level: string;
  badge: string;
  /** The floor channel itself: corridor, or the open floor for a floor without rooms */
  corridor: Space;
  rooms: Room[];
  /** only without rooms: open floor */
  open: boolean;
  lock: LockReason | null;
  /** all users in the floor's visible subtree */
  population: number;
  isSelf: boolean;
}

export type SelfLocation =
  | { kind: "room" | "corridor" | "open-floor"; floorId: number; channelId: number }
  | { kind: "locked-floor"; floorId: number; channelId: number }
  | { kind: "entrance" }
  /** in a hidden (linked) channel */
  | { kind: "hidden"; channelId: number };

export interface Building {
  name: string;
  serverVersion: string;
  floors: Floor[];
  /** Users in the root channel */
  entrance: UserView[];
  /** all users on the server, including in hidden channels */
  online: number;
  /** `null` as long as no paired plugin is connected */
  self: SelfLocation | null;
  /** The own user may tend the whole building: the plant at the entrance (Write on the root channel, ADR-0014) */
  canTendBuilding: boolean;
}

// ---------------------------------------------------------------- individual rules

const collator = new Intl.Collator("de");

/** Sibling channels as in the Mumble client: by `position`, then by name (analysis 3.3). */
export function sortSiblings<T extends Pick<Channel, "position" | "name">>(channels: readonly T[]): T[] {
  return [...channels].sort((a, b) => a.position - b.position || collator.compare(a.name, b.name));
}

/**
 * Visible channels: linked channels disappear together with all subchannels (docs/internal/charter.md, O2, O3).
 * The root channel is always visible.
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
 * Width follows occupancy: an empty room has 1, every person adds 0.4, up to 8 people (4.2).
 * Rooms in a row share its width in this ratio.
 */
export function roomGrow(people: number): number {
  return Math.round((1 + 0.4 * Math.min(Math.max(people, 0), 8)) * 10) / 10;
}

/**
 * The top row has ⌊n/2⌋ rooms (at least one), so with an odd count the bottom row gets
 * one room more. A single room is at the top.
 */
export function splitRows<T>(rooms: readonly T[]): { top: T[]; bottom: T[] } {
  const top = Math.max(Math.min(rooms.length, 1), Math.floor(rooms.length / 2));
  return { top: rooms.slice(0, top), bottom: rooms.slice(top) };
}

/**
 * Width of the floor plan's rows relative to the visible width: 1 up to ROOMS_IN_VIEW rooms per row,
 * beyond that it grows so that on average ROOMS_IN_VIEW rooms are in view, and the plan scrolls sideways.
 */
export function rowsWidth(rooms: number): number {
  const { top, bottom } = splitRows(Array.from({ length: rooms }));
  return Math.max(1, Math.max(top.length, bottom.length) / ROOMS_IN_VIEW);
}

/** Floors with at most this many rooms get narrower when the board is open */
export const FEW_ROOMS = 2;

const segmenter = new Intl.Segmenter("de", { granularity: "grapheme" });

/** The first two characters (graphemes) of the name; emojis and accents stay whole. */
export function initials(name: string): string {
  return [...segmenter.segment(name.trim())].slice(0, 2).map((s) => s.segment).join("");
}

/** Occupancy: “free” / “1 person” / “N people” (in the web UI's language) */
export function countText(n: number): string {
  return t().people.count(n);
}

export function isMutedRoomName(name: string): boolean {
  return /\((stumm|muted)\)/i.test(name);
}

export function presenceOf(u: Pick<User, "selfDeaf" | "idleMinutes">): Presence {
  if (u.selfDeaf && u.idleMinutes >= AWAY_MINUTES) return "away";
  if (u.idleMinutes >= QUIET_MINUTES) return "quiet";
  return "active";
}

/** Default: image from the service, versioned (AP9) */
const defaultAvatarUrl = (userId: number, version: string) => `/avatar/${userId}?v=${version}`;

/** Avatar image of a user, if registered and one is set */
export function avatarUrlOf(u: Pick<User, "userId" | "avatar">, url: BuildOptions["avatarUrl"] = defaultAvatarUrl): string | null {
  return u.userId !== null && u.avatar ? url!(u.userId, u.avatar) : null;
}

export interface BuildOptions {
  avatarUrl?: (userId: number, version: string) => string;
}

/** “Ground floor”/“G”, “1st floor”/“1” … (in the web UI's language) */
export function floorLabels(index: number): { level: string; badge: string } {
  const f = t().floors;
  return index === 0 ? { level: f.ground, badge: f.groundBadge } : { level: f.upper(index), badge: String(index) };
}

// ---------------------------------------------------------------- Building

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
    avatarUrl: avatarUrlOf(u, avatarUrl),
    presence: presenceOf(u),
    idleMinutes: u.idleMinutes,
    recording: u.recording,
  });
  const viewsIn = (id: number) =>
    (usersIn.get(id) ?? []).slice().sort((a, b) => collator.compare(a.name, b.name)).map(userView);

  const selfUser = snapshot.users.find((u) => u.session === selfSession);
  const care = new Set(snapshot.care ?? []);
  const space = (c: Channel): Space => ({
    channelId: c.id,
    name: c.name,
    users: viewsIn(c.id),
    isSelf: selfUser?.channel === c.id,
    locked: snapshot.canEnter[String(c.id)] === false,
    listeners: snapshot.listeners[String(c.id)] ?? [],
    recording: (usersIn.get(c.id) ?? []).some((u) => u.recording),
    canTend: care.has(c.id),
  });
  const subtreePopulation = (id: number): number =>
    (usersIn.get(id)?.length ?? 0) + childrenOf(id).reduce((n, c) => n + subtreePopulation(c.id), 0);
  const subtreeIds = (id: number): number[] => [id, ...childrenOf(id).flatMap((c) => subtreeIds(c.id))];

  const floors: Floor[] = childrenOf(0).map((f, index) => {
    const roomChannels = childrenOf(f.id);
    const lock: LockReason | null = roomChannels.some((r) => childrenOf(r.id).length > 0) ? "too-deep" : null;
    return {
      channelId: f.id,
      name: f.name,
      ...floorLabels(index),
      corridor: space(f),
      rooms: roomChannels.map((r) => ({
        ...space(r),
        muted: isMutedRoomName(r.name),
        grow: roomGrow(usersIn.get(r.id)?.length ?? 0),
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
    canTendBuilding: care.has(0),
  };
}

/**
 * The own user's place for the room sign in the top bar: its name and how many people are in it.
 * Hidden channels are not named; on a locked floor the channel name comes from the snapshot.
 */
export function ownPlace(building: Building, snapshot: Snapshot): { name: string; people: number } | null {
  const self = building.self;
  if (!self) return null;
  if (self.kind === "entrance") return { name: t().common.entrance, people: building.entrance.length };
  const inChannel = snapshot.users.filter((u) => u.channel === self.channelId).length;
  if (self.kind === "hidden") return { name: t().core.hiddenPlace, people: inChannel };
  const floor = building.floors.find((f) => f.channelId === self.floorId);
  if (self.kind === "corridor") return { name: t().common.corridor, people: inChannel };
  if (self.kind === "open-floor") return { name: floor?.name ?? "", people: inChannel };
  const name = snapshot.channels.find((c) => c.id === self.channelId)?.name ?? "";
  return { name, people: inChannel };
}

/** Which floor is shown at start or on “Go to my floor”: your own, otherwise the first displayable one. */
export function homeFloor(building: Building): Floor | null {
  const own = building.floors.find((f) => f.isSelf);
  return own ?? building.floors.find((f) => !f.lock) ?? null;
}
