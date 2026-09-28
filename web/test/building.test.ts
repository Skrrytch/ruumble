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
  isVacant,
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
  v: 1, type: "snapshot", server: { name: "Haus", version: "1.6.870" }, self: self === null ? null : { session: self },
  channels, users, listeners: {}, canEnter: {}, boards: [], ...extra,
});

describe("Einzelregeln", () => {
  it("sortiert Geschwister nach position, dann Name (deutsche Sortierung)", () => {
    const sorted = sortSiblings([ch(1, 0, "Zeta", 1), ch(2, 0, "Österreich", 0), ch(3, 0, "Oben", 0), ch(4, 0, "alpha", 1)]);
    expect(sorted.map((c) => c.name)).toEqual(["Oben", "Österreich", "alpha", "Zeta"]);
  });

  it("roomGrow: Raum 1 und 2 groß, danach schrittweise kleiner", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(roomGrow)).toEqual([1.3, 1.3, 1.1, 1.05, 1, 0.95, 0.9, 0.85]);
    expect(roomGrow(20)).toBe(0.85);
  });


  it("splitRows: untere Reihe bekommt bei ungerader Anzahl einen Raum mehr", () => {
    expect(splitRows([1, 2, 3, 4, 5])).toEqual({ top: [1, 2], bottom: [3, 4, 5] });
    expect(splitRows([1, 2, 3])).toEqual({ top: [1], bottom: [2, 3] });
    expect(splitRows([1, 2])).toEqual({ top: [1], bottom: [2] });
    expect(splitRows([1])).toEqual({ top: [1], bottom: [] });
    expect(splitRows([])).toEqual({ top: [], bottom: [] });
  });

  it("initials bleiben bei Emojis und zusammengesetzten Zeichen ganz", () => {
    expect(initials("Anna")).toBe("An");
    expect(initials("  Ben ")).toBe("Be");
    expect(initials("👩‍💻Clara")).toBe("👩‍💻C");
    expect(initials("Éva")).toBe("Év");
    expect(initials("X")).toBe("X");
  });

  it("countText", () => {
    expect([0, 1, 2].map(countText)).toEqual(["frei", "1 Person", "2 Personen"]);
  });

  it("„(stumm)“ im Namen, unabhängig von Groß-/Kleinschreibung", () => {
    expect(isMutedRoomName("Fokusraum (stumm)")).toBe(true);
    expect(isMutedRoomName("Fokus (STUMM)")).toBe(true);
    expect(isMutedRoomName("stumm")).toBe(false);
  });

  it("floorLabels: EG, dann n. Obergeschoss", () => {
    expect(floorLabels(0)).toEqual({ level: "Erdgeschoss", badge: "EG" });
    expect(floorLabels(2)).toEqual({ level: "2. Obergeschoss", badge: "2" });
  });

  it("visibleChannels: verlinkte Kanäle verschwinden samt Unterkanälen, Root bleibt", () => {
    const channels = [ch(0, null, "R", 0, [9]), ch(1, 0, "A", 0, [2]), ch(2, 0, "B", 0, [1]), ch(3, 1, "A1"), ch(4, 3, "A1a"), ch(5, 0, "C")];
    expect(visibleChannels(channels).map((c) => c.name)).toEqual(["R", "C"]);
  });
});

describe("Musterhaus (Normalfall)", () => {
  const b = buildBuilding(fixture("musterhaus"));

  it("Etagen in Mumble-Reihenfolge, EG zuerst", () => {
    expect(b.floors.map((f) => [f.badge, f.name])).toEqual([["EG", "Lobby"], ["1", "ENTWICKLUNG"], ["2", "VERTRIEB"]]);
    expect(b.floors[1]?.level).toBe("1. Obergeschoss");
  });

  it("Räume nach position, Flur = Etagenkanal, Lobby ist offene Etage", () => {
    const dev = b.floors[1]!;
    expect(dev.rooms.map((r) => r.name)).toEqual(["Büro von Anna", "Büro von Ben", "Büro von Clara", "Büro von David", "Büro von Eva", "Büro von Felix"]);
    expect(dev.corridor.channelId).toBe(2);
    expect(dev.open).toBe(false);
    expect(b.floors[0]?.open).toBe(true);
    expect(b.floors.every((f) => f.lock === null)).toBe(true);
  });

  it("Belegung, eigener Raum und eigene Etage", () => {
    expect(b.online).toBe(6);
    expect(b.floors.map((f) => f.population)).toEqual([3, 1, 2]);
    expect(b.self).toEqual({ kind: "room", floorId: 2, channelId: 3 });
    const anna = b.floors[1]!.rooms[0]!;
    expect(anna.isSelf).toBe(true);
    expect(anna.users).toMatchObject([{ name: "Anna", initials: "An", isSelf: true }]);
    expect(b.floors.map((f) => f.isSelf)).toEqual([false, true, false]);
    expect(homeFloor(b)?.name).toBe("ENTWICKLUNG");
    expect(isVacant(b)).toBe(false);
  });

  it("Nutzer im Raum alphabetisch, „(stumm)“-Raum markiert", () => {
    const tk = b.floors[2]!.rooms.find((r) => r.name === "Teeküche")!;
    expect(tk.users.map((u) => u.name)).toEqual(["Gregor", "Hanna"]);
    expect(b.floors[2]!.rooms.find((r) => r.name === "Fokusraum (stumm)")?.muted).toBe(true);
  });
});

describe("Sonderfälle", () => {
  const b = buildBuilding(fixture("sonderfaelle"));
  const floor = (name: string) => b.floors.find((f) => f.name === name);

  it("verlinkte Etagen verschwinden ganz, Nummerierung ohne Lücke (O2)", () => {
    expect(floor("EXTERN")).toBeUndefined();
    expect(floor("PARTNER")).toBeUndefined();
    expect(b.floors.map((f) => f.badge)).toEqual(["EG", "1", "2", "3", "4", "5"]);
  });

  it("verlinkte Räume verschwinden, die übrigen bleiben", () => {
    expect(floor("VERTRIEB")!.rooms.map((r) => r.name)).toEqual(["Abwesend", "Fokusraum (stumm)", "Gregors Büro", "Projektraum"]);
  });

  it("zu tiefe Etage gesperrt, Nutzer der 3. Ebene zählen zur Etage", () => {
    expect(floor("ARCHIV")).toMatchObject({ lock: "too-deep", population: 1 });
  });

  it("mehr als 8 Räume sperren die Etage", () => {
    expect(floor("GROSSRAUM")!.rooms).toHaveLength(MAX_ROOMS + 1);
    expect(floor("GROSSRAUM")!.lock).toBe("too-many-rooms");
  });

  it("temporäre Kanäle sind normale Räume", () => {
    expect(floor("ENTWICKLUNG")!.rooms.at(-1)?.name).toBe("Besprechung (temporär)");
  });

  it("Eingang, online inklusive ausgeblendeter Kanäle (O4)", () => {
    expect(b.entrance.map((u) => u.name)).toEqual(["Ida", "Jonas"]);
    expect(b.online).toBe(13);
    const onFloors = b.floors.reduce((n, f) => n + f.population, 0);
    expect(onFloors + b.entrance.length).toBe(13 - 3); // Gregor + Hanna (Teeküche↔Raucherecke) und Lena (Gästebüro) sind ausgeblendet
  });

  it("Mitlauschen, Schloss und Nutzerstatus", () => {
    expect(floor("ENTWICKLUNG")!.rooms.find((r) => r.name === "Büro von Clara")?.listeners).toEqual([3]);
    expect(floor("VERTRIEB")!.rooms.find((r) => r.name === "Gregors Büro")?.locked).toBe(true);
    expect(floor("VERTRIEB")!.rooms.find((r) => r.name === "Abwesend")?.locked).toBe(false);
    const lobby = floor("Lobby")!.corridor.users;
    expect(lobby.find((u) => u.name === "Ben")).toMatchObject({ selfMuted: true, selfDeafened: false, serverMuted: false });
    expect(lobby.find((u) => u.name === "Felix")).toMatchObject({ selfMuted: true, selfDeafened: true });
    const dev = floor("ENTWICKLUNG")!;
    expect(dev.rooms.find((r) => r.name === "Besprechung (temporär)")?.users[0]?.serverMuted).toBe(true);
    expect(dev.rooms.find((r) => r.name === "Büro von Clara")?.users[0]?.serverMuted).toBe(true); // suppress
  });
});

describe("Wo ist der eigene Nutzer?", () => {
  const house = [ch(0, null, "R"), ch(1, 0, "EG"), ch(2, 0, "OG", 1), ch(3, 2, "Raum"), ch(4, 0, "Tief", 2), ch(5, 4, "T1"), ch(6, 5, "T1a"), ch(7, 0, "Link", 3, [8]), ch(8, 0, "Link2", 4, [7])];
  const at = (channel: number) => buildBuilding(snapshot(house, [user(1, "Ich", channel)], 1));

  it.each([
    [0, { kind: "entrance" }],
    [1, { kind: "open-floor", floorId: 1, channelId: 1 }],
    [2, { kind: "corridor", floorId: 2, channelId: 2 }],
    [3, { kind: "room", floorId: 2, channelId: 3 }],
    [6, { kind: "locked-floor", floorId: 4, channelId: 6 }],
    [7, { kind: "hidden", channelId: 7 }],
  ])("Kanal %i → %j", (channel, expected) => {
    expect(at(channel).self).toEqual(expected);
  });

  it("gesperrte eigene Etage wird trotzdem angezeigt, versteckter Kanal führt zur ersten darstellbaren", () => {
    expect(homeFloor(at(6))?.name).toBe("Tief");
    expect(homeFloor(at(7))?.name).toBe("EG");
  });

  it("ohne gekoppeltes Plugin gibt es keinen eigenen Nutzer", () => {
    const b = buildBuilding(fixture("nicht-gekoppelt"));
    expect(b.self).toBeNull();
    expect(b.floors.some((f) => f.isSelf)).toBe(false);
    expect(b.floors.flatMap((f) => f.rooms).some((r) => r.isSelf)).toBe(false);
  });
});

describe("Leerstand und Live-Änderungen", () => {
  it("keine darstellbare Etage → Leerstand", () => {
    const b = buildBuilding(fixture("leerstand"));
    expect(isVacant(b)).toBe(true);
    expect(homeFloor(b)).toBeNull();
    expect(b.self).toEqual({ kind: "entrance" });
    expect(isVacant(buildBuilding(snapshot([ch(0, null, "R")])))).toBe(true);
  });

  it("Unterkanal angelegt → Etage gesperrt, wieder entfernt → frei", () => {
    const base = [ch(0, null, "R"), ch(1, 0, "OG"), ch(2, 1, "Raum")];
    expect(buildBuilding(snapshot(base)).floors[0]?.lock).toBeNull();
    expect(buildBuilding(snapshot([...base, ch(3, 2, "Neu")])).floors[0]?.lock).toBe("too-deep");
    expect(buildBuilding(snapshot(base)).floors[0]?.lock).toBeNull();
  });

  it("verlinkter Unterkanal sperrt nicht (O3), 9. Raum sperrt, Link darauf gibt wieder frei", () => {
    const rooms = Array.from({ length: 8 }, (_, i) => ch(10 + i, 1, `R${i}`, i));
    const base = [ch(0, null, "R"), ch(1, 0, "OG"), ...rooms];
    expect(buildBuilding(snapshot([...base, ch(30, 10, "Sub", 0, [31]), ch(31, 0, "X", 9, [30])])).floors[0]?.lock).toBeNull();
    expect(buildBuilding(snapshot([...base, ch(20, 1, "R8", 8)])).floors[0]?.lock).toBe("too-many-rooms");
    expect(buildBuilding(snapshot([...base, ch(20, 1, "R8", 8, [21]), ch(21, 0, "Y", 9, [20])])).floors[0]?.lock).toBeNull();
  });

  it("beide Sperrgründe: „zu tief“ hat Vorrang", () => {
    const rooms = Array.from({ length: 9 }, (_, i) => ch(10 + i, 1, `R${i}`, i));
    expect(buildBuilding(snapshot([ch(0, null, "R"), ch(1, 0, "OG"), ...rooms, ch(40, 10, "Sub")])).floors[0]?.lock).toBe("too-deep");
  });

  it("Umbenennen ändert die Reihenfolge bei gleicher position", () => {
    const b = buildBuilding(snapshot([ch(0, null, "R"), ch(1, 0, "Bravo"), ch(2, 0, "Alpha")]));
    expect(b.floors.map((f) => f.name)).toEqual(["Alpha", "Bravo"]);
  });
});

describe("Avatare (AP9) und Anwesenheit (AP10)", () => {
  const b = buildBuilding(fixture("sonderfaelle"));
  const find = (name: string) => b.floors.flatMap((f) => [f.corridor, ...f.rooms]).flatMap((s) => s.users).concat(b.entrance).find((u) => u.name === name)!;

  it("Avatar-URL nur für registrierte Nutzer mit Bild, eigene URL-Funktion möglich", () => {
    expect(find("Anna").avatarUrl).toBe("/avatar/1?v=a1b2c3d4e5f60718");
    expect(find("Ben").avatarUrl).toBeNull(); // registriert, aber ohne Bild
    expect(find("Ida").avatarUrl).toBeNull(); // unregistriert
    const custom = buildBuilding(fixture("sonderfaelle"), { avatarUrl: (id, v) => `x:${id}:${v}` });
    expect(custom.floors[1]!.rooms[0]!.users[0]!.avatarUrl).toBe("x:1:a1b2c3d4e5f60718");
  });

  it("still ab 15 Min., abwesend nur mit selbst taub ab 5 Min.", () => {
    expect([QUIET_MINUTES, AWAY_MINUTES]).toEqual([15, 5]);
    expect(presenceOf({ selfDeaf: false, idleMinutes: 14 })).toBe("active");
    expect(presenceOf({ selfDeaf: false, idleMinutes: 15 })).toBe("quiet");
    expect(presenceOf({ selfDeaf: true, idleMinutes: 4 })).toBe("active");
    expect(presenceOf({ selfDeaf: true, idleMinutes: 5 })).toBe("away");
    expect(find("Ben").presence).toBe("quiet"); // 20 Min., nicht taub
    expect(find("Felix").presence).toBe("away"); // taub, 12 Min.
    expect(find("Jonas").presence).toBe("quiet"); // im Eingang, 40 Min.
  });

  it("Aufnahme am Nutzer und am Raum", () => {
    expect(find("Eva").recording).toBe(true);
    const lobby = b.floors.find((f) => f.name === "Lobby")!;
    expect(lobby.corridor.recording).toBe(true);
    expect(b.floors.find((f) => f.name === "ENTWICKLUNG")!.rooms.some((r) => r.recording)).toBe(false);
  });
});
