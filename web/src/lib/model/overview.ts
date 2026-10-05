/**
 * Building overview (ADR-0019): the directory board in the lobby ("Haustafel") next to the cross-section of the
 * building. Who is online, on which floor and in which room, with their status; searchable, and the way to go to
 * someone. Pure functions over the snapshot and the derived building (ADR-0007).
 */
import type { Channel, Snapshot } from "@ruumble/protocol";
import { t } from "../i18n/index.svelte.ts";
import { userViewOf, visibleChannels, type BuildOptions, type Building, type UserView } from "./building.ts";

/** a person on the directory board, with the place they are at */
export interface DirectoryEntry {
  user: UserView;
  channelId: number;
  /** room name, "Corridor", the floor's name (open floor), "Entrance" or "not shown" */
  place: string;
  /** the own user may move there: not the own channel, allowed by Mumble, a place Ruumble shows (no locked floor) */
  canGo: boolean;
}

/** one line of the board: a floor (highest first), the entrance, or channels Ruumble does not show */
export interface DirectoryGroup {
  kind: "floor" | "entrance" | "elsewhere";
  /** the floor channel; 0 for the entrance; null for "elsewhere" */
  channelId: number | null;
  badge: string;
  name: string;
  /** a floor too deep to show (ADR-0007): listed, not drawn */
  locked: boolean;
  isSelf: boolean;
  people: DirectoryEntry[];
}

const collator = new Intl.Collator("de");

/** Everyone in the building, grouped like the elevator: highest floor first, then the entrance, then the rest */
export function buildDirectory(snapshot: Snapshot, building: Building, options: BuildOptions = {}): DirectoryGroup[] {
  const selfSession = snapshot.self?.session ?? null;
  const selfChannel = snapshot.users.find((u) => u.session === selfSession)?.channel ?? null;
  const byId = new Map(snapshot.channels.map((c) => [c.id, c]));
  const visible = new Set(visibleChannels(snapshot.channels).map((c) => c.id));
  /** the floor (child of the root channel) a channel belongs to, null for the root itself */
  const floorOf = (id: number): number | null => {
    let c: Channel | undefined = byId.get(id);
    while (c && c.parent !== null && c.parent !== 0) c = byId.get(c.parent);
    return c && c.parent === 0 ? c.id : null;
  };
  const floors = new Map(building.floors.map((f) => [f.channelId, f]));

  const groups = new Map<string, DirectoryGroup>();
  for (const f of [...building.floors].reverse()) {
    groups.set(`f${f.channelId}`, { kind: "floor", channelId: f.channelId, badge: f.badge, name: f.name, locked: f.lock !== null, isSelf: f.isSelf, people: [] });
  }
  groups.set("entrance", { kind: "entrance", channelId: 0, badge: "", name: t().common.entrance, locked: false, isSelf: selfChannel === 0, people: [] });
  const elsewhere: DirectoryGroup = { kind: "elsewhere", channelId: null, badge: "", name: t().overview.elsewhere, locked: false, isSelf: false, people: [] };

  for (const u of snapshot.users) {
    const ch = u.channel;
    const floorId = visible.has(ch) ? floorOf(ch) : null;
    const floor = floorId === null ? undefined : floors.get(floorId);
    const group = ch === 0 ? groups.get("entrance")! : floor ? groups.get(`f${floor.channelId}`)! : elsewhere;
    const place =
      group.kind === "entrance" ? t().common.entrance
      : group.kind === "elsewhere" ? t().core.hiddenPlace
      : ch === floor!.channelId ? (floor!.open ? floor!.name : t().common.corridor)
      : (byId.get(ch)?.name ?? "");
    const canGo = selfSession !== null && u.session !== selfSession && ch !== selfChannel && group.kind !== "elsewhere" && !group.locked && snapshot.canEnter[String(ch)] !== false;
    group.people.push({ user: userViewOf(u, selfSession, options.avatarUrl), channelId: ch, place, canGo });
  }
  const all = [...groups.values(), ...(elsewhere.people.length ? [elsewhere] : [])];
  for (const g of all) g.people.sort((a, b) => collator.compare(a.user.name, b.user.name));
  return all;
}

/** the groups with only the people matching every word of `query` (name, place or status); empty query: all */
export function filterDirectory(groups: readonly DirectoryGroup[], query: string): DirectoryGroup[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...groups];
  return groups
    .map((g) => ({
      ...g,
      people: g.people.filter((p) => {
        const haystack = [p.user.name, p.place, p.user.status?.text ?? "", g.name].join("\n").toLocaleLowerCase();
        return words.every((w) => haystack.includes(w));
      }),
    }))
    .filter((g) => g.people.length > 0);
}

/** the first person one can go to (Enter in the search) */
export function firstReachable(groups: readonly DirectoryGroup[]): DirectoryEntry | null {
  for (const g of groups) for (const p of g.people) if (p.canGo) return p;
  return null;
}
