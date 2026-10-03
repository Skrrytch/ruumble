/**
 * Pure helpers for the care dialogs (ADR-0014): where a level sits in the building (breadcrumb), how many days
 * the data of a deleted room has left, how full the storage is. No Svelte, no DOM.
 */
import type { Channel } from "@ruumble/protocol";
import type { Building } from "../model/building.ts";

/** whose stored data a care dialog shows */
export type CareTarget = { kind: "room" | "floor"; channelId: number } | { kind: "building" };

/** one part of the breadcrumb; `target` set: the viewer may tend that level and can jump there */
export interface CareCrumb {
  kind: CareTarget["kind"];
  label: string;
  target: CareTarget | null;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Breadcrumb "Building › Floor › Room" for a target. A parent level is a link only if the viewer may tend it
 * (`care`: the snapshot's channels with care permission, 0 = the building); the last part is the current level.
 */
export function careCrumbs(target: CareTarget, channels: readonly Channel[], care: readonly number[], buildingLabel: string): CareCrumb[] {
  const may = new Set(care);
  const name = (id: number) => channels.find((c) => c.id === id)?.name ?? "";
  const building: CareCrumb = { kind: "building", label: buildingLabel, target: may.has(0) ? { kind: "building" } : null };
  if (target.kind === "building") return [{ ...building, target: null }];
  if (target.kind === "floor") return [building, { kind: "floor", label: name(target.channelId), target: null }];
  const floorId = channels.find((c) => c.id === target.channelId)?.parent ?? null;
  const floor: CareCrumb[] = floorId === null || floorId === 0 ? [] : [{ kind: "floor", label: name(floorId), target: may.has(floorId) ? { kind: "floor", channelId: floorId } : null }];
  return [building, ...floor, { kind: "room", label: name(target.channelId), target: null }];
}

/** whole days until the cleanup removes the data of a room found missing at `goneSince` (0: at the next cleanup) */
export function purgeDays(goneSince: number, graceDays: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((goneSince + graceDays * DAY - now) / DAY));
}

/** the elevator's label of a floor ("G", "1", …), null if the floor is not shown in the building */
export function floorBadge(building: Pick<Building, "floors">, floorId: number): string | null {
  return building.floors.find((f) => f.channelId === floorId)?.badge ?? null;
}

/** number of rooms a floor has in the building (all, not only those with posts) */
export function roomCount(building: Pick<Building, "floors">, floorId: number): number {
  return building.floors.find((f) => f.channelId === floorId)?.rooms.length ?? 0;
}

/** share of the quota in use, 0…1 */
export function storageShare(usedBytes: number, quotaBytes: number): number {
  return quotaBytes > 0 ? Math.min(1, usedBytes / quotaBytes) : 0;
}
