import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Snapshot, type Channel, type User } from "@ruumble/protocol";
import {
  AWAY_MINUTES,
  MAX_ROOMS,
  QUIET_MINUTES,
  presenceOf,
  buildBuilding,
  countText,
  floorLabels,
  homeFloor,
  initials,
  isMutedRoomName,
  roomGrow,
  sortSiblings,
  splitRows,
  visibleChannels,
} from "../src/lib/model/building.ts";

const fixture = (name: string): Snapshot =>
  Snapshot.parse(JSON.parse(readFileSync(new URL(`../../protocol/fixtures/${name}.json`, import.meta.url), "utf8")));

const ch = (id: number, parent: number | null, name: string, position = 0, links: number[] = []): Channel => ({
  id, parent, name, position, links, temporary: false,
});
const user = (session: number, name: string, channel: number, extra: Partial<User> = {}): User => ({
  session, name, channel, selfMute: false, selfDeaf: false, mute: false, deaf: false, suppress: false,
  userId: null, avatar: null, idleMinutes: 0, recording: false, ...extra,
});
const snapshot = (channels: Channel[], users: User[] = [], self: number | null = null, extra: Partial<Snapshot> = {}): Snapshot => ({
  v: 1, type: "snapshot", server: { name: "HQ", version: "1.6.870" }, self: self === null ? null : { session: self },
  channels, users, listeners: {}, canEnter: {}, ...extra,
});

describe("Individual rules", () => {
  it("sorts siblings by position, then name (German collation)", () => {
    const sorted = sortSiblings([ch(1, 0, "Zeta", 1), ch(2, 0, "Österreich", 0), ch(3, 0, "Oben", 0), ch(4, 0, "alpha", 1)]);
    expect(sorted.map((c) => c.name)).toEqual(["Oben", "Österreich", "alpha", "Zeta"]);
  });

  it("roomGrow: rooms 1 and 2 large, then gradually smaller", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(roomGrow)).toEqual([1.3, 1.3, 1.1, 1.05, 1, 0.95, 0.9, 0.85]);
    expect(roomGrow(20)).toBe(0.85);
  });

  it("splitRows: bottom row gets one more room for an odd count", () => {
    expect(splitRows([1, 2, 3, 4, 5])).toEqual({ top: [1, 2], bottom: [3, 4, 5] });
    expect(splitRows([1, 2, 3])).toEqual({ top: [1], bottom: [2, 3] });
    expect(splitRows([1, 2])).toEqual({ top: [1], bottom: [2] });
    expect(splitRows([1])).toEqual({ top: [1], bottom: [] });
    expect(splitRows([])).toEqual({ top: [], bottom: [] });
  });

  it("initials keep emojis and combined characters whole", () => {
    expect(initials("Anna")).toBe("An");
    expect(initials("  Ben ")).toBe("Be");
    expect(initials("👩‍💻Clara")).toBe("👩‍💻C");
    expect(initials("Éva")).toBe("Év");
    expect(initials("X")).toBe("X");
  });

  it("countText", () => {
    expect([0, 1, 2].map(countText)).toEqual(["free", "1 person", "2 people"]);
  });

  it("“(muted)” or German “(stumm)” in the name, case-insensitive", () => {
    expect(isMutedRoomName("Focus room (stumm)")).toBe(true);
    expect(isMutedRoomName("Focus (MUTED)")).toBe(true);
    expect(isMutedRoomName("Focus (muted)")).toBe(true);
    expect(isMutedRoomName("muted")).toBe(false);
  });

  it("floorLabels: ground floor, then nth floor", () => {
    expect(floorLabels(0)).toEqual({ level: "Ground floor", badge: "G" });
    expect(floorLabels(2)).toEqual({ level: "2nd floor", badge: "2" });
  });

  it("visibleChannels: linked channels vanish with their subchannels, root stays", () => {
    const channels = [ch(0, null, "R", 0, [9]), ch(1, 0, "A", 0, [2]), ch(2, 0, "B", 0, [1]), ch(3, 1, "A1"), ch(4, 3, "A1a"), ch(5, 0, "C")];
    expect(visibleChannels(channels).map((c) => c.name)).toEqual(["R", "C"]);
  });
});

describe("Sample building (normal case)", () => {
  const b = buildBuilding(fixture("sample"));

  it("floors in Mumble order, ground floor first", () => {
    expect(b.floors.map((f) => [f.badge, f.name])).toEqual([["G", "Lobby"], ["1", "Development"], ["2", "Support"]]);
    expect(b.floors[1]?.level).toBe("1st floor");
  });

  it("rooms by position, corridor = floor channel, lobby is an open floor", () => {
    const dev = b.floors[1]!;
    expect(dev.rooms.map((r) => r.name)).toEqual(["Let's talk", "Let's play", "Retrospective", "Ben's office", "Clara's office"]);
    expect(dev.corridor.channelId).toBe(2);
    expect(dev.open).toBe(false);
    expect(b.floors[0]?.open).toBe(true);
    expect(b.floors.every((f) => f.lock === null)).toBe(true);
  });

  it("occupancy, own room and own floor", () => {
    expect(b.online).toBe(8);
    expect(b.floors.map((f) => f.population)).toEqual([2, 4, 2]);
    expect(b.self).toEqual({ kind: "room", floorId: 2, channelId: 3 });
    const talk = b.floors[1]!.rooms[0]!;
    expect(talk.isSelf).toBe(true);
    expect(talk.users).toMatchObject([{ name: "Anna", initials: "An", isSelf: true }, { name: "Clara", isSelf: false }, { name: "David", isSelf: false }]);
    expect(b.floors[1]!.rooms.filter((r) => r.isSelf)).toHaveLength(1);
    expect(b.floors.map((f) => f.isSelf)).toEqual([false, true, false]);
    expect(homeFloor(b)?.name).toBe("Development");
  });

  it("users in a room alphabetical, “(muted)” room flagged", () => {
    // Eva (session 3) before Felix (session 2): sorted by name, not by session
    expect(b.floors[0]!.corridor.users.map((u) => u.name)).toEqual(["Eva", "Felix"]);
    expect(b.floors[2]!.rooms.map((r) => r.users.map((u) => u.name))).toEqual([["Gregor"], [], ["Hanna"], []]);
    expect(b.floors.flatMap((f) => f.rooms).some((r) => r.muted)).toBe(false);
    // the sample building has no muted room, the edge cases do
    const edge = buildBuilding(fixture("edge-cases")).floors.find((f) => f.name === "SALES")!;
    expect(edge.rooms.find((r) => r.name === "Focus room (muted)")?.muted).toBe(true);
    expect(edge.rooms.find((r) => r.name === "Away")?.muted).toBe(false);
  });
});

describe("Edge cases", () => {
  const b = buildBuilding(fixture("edge-cases"));
  const floor = (name: string) => b.floors.find((f) => f.name === name);

  it("linked floors vanish entirely, numbering without gaps (O2)", () => {
    expect(floor("EXTERNAL")).toBeUndefined();
    expect(floor("PARTNERS")).toBeUndefined();
    expect(b.floors.map((f) => f.badge)).toEqual(["G", "1", "2", "3", "4", "5"]);
  });

  it("linked rooms vanish, the rest stay", () => {
    expect(floor("SALES")!.rooms.map((r) => r.name)).toEqual(["Away", "Focus room (muted)", "Gregor's office", "Project room"]);
  });

  it("floor nested too deep is locked, users on level 3 count towards the floor", () => {
    expect(floor("ARCHIVE")).toMatchObject({ lock: "too-deep", population: 1 });
  });

  it("more than 8 rooms lock the floor", () => {
    expect(floor("OPEN SPACE")!.rooms).toHaveLength(MAX_ROOMS + 1);
    expect(floor("OPEN SPACE")!.lock).toBe("too-many-rooms");
  });

  it("temporary channels are normal rooms", () => {
    expect(floor("DEVELOPMENT")!.rooms.at(-1)?.name).toBe("Meeting (temporary)");
  });

  it("entrance, online count includes hidden channels (O4)", () => {
    expect(b.entrance.map((u) => u.name)).toEqual(["Ida", "Jonas"]);
    expect(b.online).toBe(13);
    const onFloors = b.floors.reduce((n, f) => n + f.population, 0);
    expect(onFloors + b.entrance.length).toBe(13 - 3); // Gregor + Hanna (Kitchen↔Coffee corner) and Lena (Guest office) are hidden
  });

  it("listeners, lock and user status", () => {
    expect(floor("DEVELOPMENT")!.rooms.find((r) => r.name === "Clara's office")?.listeners).toEqual([3]);
    expect(floor("SALES")!.rooms.find((r) => r.name === "Gregor's office")?.locked).toBe(true);
    expect(floor("SALES")!.rooms.find((r) => r.name === "Away")?.locked).toBe(false);
    const lobby = floor("Lobby")!.corridor.users;
    expect(lobby.find((u) => u.name === "Ben")).toMatchObject({ selfMuted: true, selfDeafened: false, serverMuted: false });
    expect(lobby.find((u) => u.name === "Felix")).toMatchObject({ selfMuted: true, selfDeafened: true });
    const dev = floor("DEVELOPMENT")!;
    expect(dev.rooms.find((r) => r.name === "Meeting (temporary)")?.users[0]?.serverMuted).toBe(true);
    expect(dev.rooms.find((r) => r.name === "Clara's office")?.users[0]?.serverMuted).toBe(true); // suppress
  });
});

describe("Where is the own user?", () => {
  const house = [ch(0, null, "R"), ch(1, 0, "Ground"), ch(2, 0, "Upper", 1), ch(3, 2, "Room"), ch(4, 0, "Deep", 2), ch(5, 4, "T1"), ch(6, 5, "T1a"), ch(7, 0, "Link", 3, [8]), ch(8, 0, "Link2", 4, [7])];
  const at = (channel: number) => buildBuilding(snapshot(house, [user(1, "Me", channel)], 1));

  it.each([
    [0, { kind: "entrance" }],
    [1, { kind: "open-floor", floorId: 1, channelId: 1 }],
    [2, { kind: "corridor", floorId: 2, channelId: 2 }],
    [3, { kind: "room", floorId: 2, channelId: 3 }],
    [6, { kind: "locked-floor", floorId: 4, channelId: 6 }],
    [7, { kind: "hidden", channelId: 7 }],
  ])("channel %i → %j", (channel, expected) => {
    expect(at(channel).self).toEqual(expected);
  });

  it("own locked floor is still shown, hidden channel falls back to the first displayable one", () => {
    expect(homeFloor(at(6))?.name).toBe("Deep");
    expect(homeFloor(at(7))?.name).toBe("Ground");
  });

  it("without a paired plugin there is no own user", () => {
    const b = buildBuilding(fixture("unpaired"));
    expect(b.self).toBeNull();
    expect(b.floors.some((f) => f.isSelf)).toBe(false);
    expect(b.floors.flatMap((f) => f.rooms).some((r) => r.isSelf)).toBe(false);
  });
});

describe("Vacancy and live changes", () => {
  it("no displayable floor → vacant", () => {
    const b = buildBuilding(fixture("vacant"));
    expect(homeFloor(b)).toBeNull();
    expect(b.self).toEqual({ kind: "entrance" });
    expect(homeFloor(buildBuilding(snapshot([ch(0, null, "R")])))).toBeNull();
  });

  it("subchannel added → floor locked, removed again → unlocked", () => {
    const base = [ch(0, null, "R"), ch(1, 0, "Upper"), ch(2, 1, "Room")];
    expect(buildBuilding(snapshot(base)).floors[0]?.lock).toBeNull();
    expect(buildBuilding(snapshot([...base, ch(3, 2, "New")])).floors[0]?.lock).toBe("too-deep");
    expect(buildBuilding(snapshot(base)).floors[0]?.lock).toBeNull();
  });

  it("linked subchannel does not lock (O3), 9th room locks, linking it unlocks again", () => {
    const rooms = Array.from({ length: 8 }, (_, i) => ch(10 + i, 1, `R${i}`, i));
    const base = [ch(0, null, "R"), ch(1, 0, "Upper"), ...rooms];
    expect(buildBuilding(snapshot([...base, ch(30, 10, "Sub", 0, [31]), ch(31, 0, "X", 9, [30])])).floors[0]?.lock).toBeNull();
    expect(buildBuilding(snapshot([...base, ch(20, 1, "R8", 8)])).floors[0]?.lock).toBe("too-many-rooms");
    expect(buildBuilding(snapshot([...base, ch(20, 1, "R8", 8, [21]), ch(21, 0, "Y", 9, [20])])).floors[0]?.lock).toBeNull();
  });

  it("both lock reasons: “too deep” wins", () => {
    const rooms = Array.from({ length: 9 }, (_, i) => ch(10 + i, 1, `R${i}`, i));
    expect(buildBuilding(snapshot([ch(0, null, "R"), ch(1, 0, "Upper"), ...rooms, ch(40, 10, "Sub")])).floors[0]?.lock).toBe("too-deep");
  });

  it("renaming changes the order at equal position", () => {
    const b = buildBuilding(snapshot([ch(0, null, "R"), ch(1, 0, "Bravo"), ch(2, 0, "Alpha")]));
    expect(b.floors.map((f) => f.name)).toEqual(["Alpha", "Bravo"]);
  });
});

describe("Avatars (AP9) and presence (AP10)", () => {
  const b = buildBuilding(fixture("edge-cases"));
  const find = (name: string) => b.floors.flatMap((f) => [f.corridor, ...f.rooms]).flatMap((s) => s.users).concat(b.entrance).find((u) => u.name === name)!;

  it("avatar URL only for registered users with an image, custom URL function possible", () => {
    expect(find("Anna").avatarUrl).toBe("/avatar/1?v=a1b2c3d4e5f60718");
    expect(find("Ben").avatarUrl).toBeNull(); // registered, but without image
    expect(find("Ida").avatarUrl).toBeNull(); // unregistered
    const custom = buildBuilding(fixture("edge-cases"), { avatarUrl: (id, v) => `x:${id}:${v}` });
    expect(custom.floors[1]!.rooms[0]!.users[0]!.avatarUrl).toBe("x:1:a1b2c3d4e5f60718");
  });

  it("quiet from 15 min, away only when self-deafened from 5 min", () => {
    expect([QUIET_MINUTES, AWAY_MINUTES]).toEqual([15, 5]);
    expect(presenceOf({ selfDeaf: false, idleMinutes: 14 })).toBe("active");
    expect(presenceOf({ selfDeaf: false, idleMinutes: 15 })).toBe("quiet");
    expect(presenceOf({ selfDeaf: true, idleMinutes: 4 })).toBe("active");
    expect(presenceOf({ selfDeaf: true, idleMinutes: 5 })).toBe("away");
    expect(find("Ben").presence).toBe("quiet"); // 20 min, not deafened
    expect(find("Felix").presence).toBe("away"); // deafened, 12 min
    expect(find("Jonas").presence).toBe("quiet"); // in the entrance, 40 min
  });

  it("recording on user and room", () => {
    expect(find("Eva").recording).toBe(true);
    const lobby = b.floors.find((f) => f.name === "Lobby")!;
    expect(lobby.corridor.recording).toBe(true);
    expect(b.floors.find((f) => f.name === "DEVELOPMENT")!.rooms.some((r) => r.recording)).toBe(false);
  });
});
