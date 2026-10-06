import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Snapshot } from "@ruumble/protocol";
import { buildBuilding } from "../src/lib/model/building.ts";
import { buildDirectory, filterDirectory, firstReachable } from "../src/lib/model/overview.ts";

const fixture = (name: string): Snapshot =>
  Snapshot.parse(JSON.parse(readFileSync(new URL(`../../protocol/fixtures/${name}.json`, import.meta.url), "utf8")));
const directory = (s: Snapshot) => buildDirectory(s, buildBuilding(s));
/** group name → [person, place, can go] */
const summary = (s: Snapshot) => Object.fromEntries(directory(s).map((g) => [g.name, g.people.map((p) => [p.user.name, p.place, p.canGo])]));

describe("Building overview: the directory (ADR-0019)", () => {
  it("highest floor first, then the entrance; people by name with their place", () => {
    const s = fixture("sample");
    const groups = directory(s);
    expect(groups.map((g) => [g.kind, g.badge, g.name, g.isSelf])).toEqual([
      ["floor", "2", "Support", false],
      ["floor", "1", "Development", true],
      ["floor", "G", "Lobby", false],
      ["entrance", "", "Entrance", false],
    ]);
    expect(summary(s)).toEqual({
      Support: [["Gregor", "Office 1", true], ["Hanna", "Office 3", true]],
      Development: [["Anna", "Let's talk", false], ["Ben", "Ben's office", true], ["Clara", "Let's talk", false], ["David", "Let's talk", false]],
      Lobby: [["Eva", "Lobby", true], ["Felix", "Lobby", true]], // a floor without rooms: the open floor
      Entrance: [],
    });
    expect(groups[1]!.people.find((p) => p.user.name === "Clara")!.user.status?.text).toBe("Focus time, please write");
  });

  it("locked floors are listed without going there, hidden channels are elsewhere, Mumble's no stays no", () => {
    const s = fixture("edge-cases");
    const all = summary(s);
    expect(all["ARCHIVE"]).toEqual([["Karl", "Subchannel", false]]); // too deep: not drawn, no going there
    expect(all["Elsewhere"]).toEqual([["Gregor", "area not shown", false], ["Hanna", "area not shown", false], ["Lena", "area not shown", false]]);
    expect(all["Entrance"]).toEqual([["Ida", "Entrance", true], ["Jonas", "Entrance", true]]);
    expect(all["DEVELOPMENT"]).toContainEqual(["Mia", "Meeting (temporary)", true]);
    expect(all["Lobby"]).toEqual([["Ben", "Lobby", true], ["Eva", "Lobby", true], ["Felix", "Lobby", true]]);
    const denied = { ...s, canEnter: { ...s.canEnter, "1": false } };
    expect(summary(denied)["Lobby"]!.every(([, , go]) => go === false)).toBe(true);
    expect(directory(s).find((g) => g.kind === "floor" && g.name === "ARCHIVE")!.locked).toBe(true);
  });

  it("a deafened person with Ruumble in the own room can be nudged (ADR-0020)", () => {
    const s = fixture("sample");
    const nudgeable = (snap: Snapshot) => directory(snap).flatMap((g) => g.people.filter((p) => p.canNudge).map((p) => p.user.name));
    expect(nudgeable(s)).toEqual([]);
    const deaf = (names: string[]) => ({ ...s, users: s.users.map((u) => (names.includes(u.name) ? { ...u, selfDeaf: true } : u)) });
    // Clara: in the own room; David: no Ruumble; Ben: another room; Anna: oneself
    expect(nudgeable(deaf(["Clara", "David", "Ben", "Anna"]))).toEqual(["Clara"]);
    expect(nudgeable({ ...deaf(["Clara"]), self: null })).toEqual([]);
  });

  it("why one cannot go to someone", () => {
    const why = (s: Snapshot) => Object.fromEntries(directory(s).flatMap((g) => g.people.map((p) => [p.user.name, p.blocked])));
    const edge = fixture("edge-cases");
    expect(why(edge)).toMatchObject({ Anna: "self", Karl: "locked-floor", Gregor: "hidden", Ida: null });
    expect(why(fixture("sample"))).toMatchObject({ Clara: "here", Ben: null });
    expect(why({ ...edge, canEnter: { ...edge.canEnter, "1": false } })).toMatchObject({ Ben: "no-access" });
    expect(why({ ...edge, self: null })).toMatchObject({ Ida: "no-mumble", Anna: "no-mumble" });
  });

  it("without an own user nobody can be visited; no 'elsewhere' when everyone is in view", () => {
    const s = { ...fixture("sample"), self: null };
    expect(directory(s).flatMap((g) => g.people).some((p) => p.canGo)).toBe(false);
    expect(directory(s).some((g) => g.kind === "elsewhere")).toBe(false);
    expect(directory({ ...fixture("sample"), users: [] }).every((g) => g.people.length === 0)).toBe(true);
  });

  it("search: every word in the name, place, status or floor; the first match one can go to", () => {
    const groups = directory(fixture("sample"));
    expect(filterDirectory(groups, "")).toHaveLength(4);
    expect(filterDirectory(groups, "  ")).toHaveLength(4);
    const names = (q: string) => filterDirectory(groups, q).flatMap((g) => g.people.map((p) => p.user.name));
    expect(names("cla")).toEqual(["Clara"]);
    expect(names("let's TALK")).toEqual(["Anna", "Clara", "David"]);
    expect(names("focus")).toEqual(["Clara"]); // status
    expect(names("support")).toEqual(["Gregor", "Hanna"]); // floor
    expect(names("office 3")).toEqual(["Hanna"]);
    expect(names("nobody")).toEqual([]);
    expect(firstReachable(filterDirectory(groups, "let's talk"))).toBeNull(); // only the own room
    expect(firstReachable(filterDirectory(groups, "office"))!.user.name).toBe("Gregor");
  });
});
