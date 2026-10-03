import { describe, expect, it } from "vitest";
import type { Channel } from "@ruumble/protocol";
import { careCrumbs, floorBadge, purgeDays, roomCount, storageShare } from "../src/lib/care/model.ts";

const ch = (id: number, parent: number | null, name: string): Channel => ({ id, parent, name, position: 0, links: [], temporary: false });
const channels = [ch(0, null, "Root"), ch(1, 0, "1F"), ch(2, 1, "Office")];
const DAY = 24 * 60 * 60 * 1000;

describe("care dialogs", () => {
  it("breadcrumb: parent levels are links only where the viewer may tend", () => {
    expect(careCrumbs({ kind: "room", channelId: 2 }, channels, [0, 1, 2], "Building")).toEqual([
      { kind: "building", label: "Building", target: { kind: "building" } },
      { kind: "floor", label: "1F", target: { kind: "floor", channelId: 1 } },
      { kind: "room", label: "Office", target: null },
    ]);
    expect(careCrumbs({ kind: "room", channelId: 2 }, channels, [2], "Building").map((c) => c.target)).toEqual([null, null, null]);
    expect(careCrumbs({ kind: "floor", channelId: 1 }, channels, [0], "Building")).toEqual([
      { kind: "building", label: "Building", target: { kind: "building" } },
      { kind: "floor", label: "1F", target: null },
    ]);
    expect(careCrumbs({ kind: "building" }, channels, [0], "Building")).toEqual([{ kind: "building", label: "Building", target: null }]);
    expect(careCrumbs({ kind: "room", channelId: 9 }, channels, [0], "B").map((c) => c.kind)).toEqual(["building", "room"]); // unknown room
  });

  it("days left for data of a deleted room", () => {
    expect(purgeDays(0, 7, 2 * DAY)).toBe(5);
    expect(purgeDays(0, 7, 2.5 * DAY)).toBe(5);
    expect(purgeDays(0, 7, 8 * DAY)).toBe(0);
  });

  it("floor badge and room count from the building, storage share", () => {
    const building = { floors: [{ channelId: 1, badge: "G", rooms: [{}, {}] }] } as never;
    expect(floorBadge(building, 1)).toBe("G");
    expect(floorBadge(building, 5)).toBeNull();
    expect(roomCount(building, 1)).toBe(2);
    expect(roomCount(building, 5)).toBe(0);
    expect(storageShare(50, 200)).toBe(0.25);
    expect(storageShare(500, 200)).toBe(1);
    expect(storageShare(5, 0)).toBe(0);
  });
});
