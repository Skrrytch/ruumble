import { describe, expect, it } from "vitest";
import {
  BUNDLE_MS,
  DEFAULT_SETTINGS,
  badgeCount,
  bundle,
  effectiveLevel,
  flashFrames,
  flashes,
  parseSettings,
  route,
  serializeSettings,
  sticky,
  titleWithCount,
  type Context,
  type Level,
  type NoticeEvent,
  type NoticeKind,
  type Settings,
} from "../src/lib/notices/model.ts";

const event = (kind: NoticeKind, over: Partial<NoticeEvent> = {}): NoticeEvent => ({ kind, at: 1000, who: ["Anna"], count: 1, ...over });
const ctx = (over: Partial<Context> = {}): Context => ({ visible: true, doNotDisturb: false, speaking: false, desktop: false, ...over });
const settings = (kind: NoticeKind, level: Level): Settings => ({ ...DEFAULT_SETTINGS, levels: { ...DEFAULT_SETTINGS.levels, [kind]: level } });

describe("route", () => {
  it("does nothing for a kind that is off", () => {
    expect(route(event("board"), settings("board", "off"), ctx())).toEqual([]);
  });

  it("quiet: only the counter in the foreground, plus title, favicon and badge in the background", () => {
    expect(route(event("board"), settings("board", "quiet"), ctx())).toEqual(["counter"]);
    expect(route(event("board"), settings("board", "quiet"), ctx({ visible: false }))).toEqual(["counter", "title", "favicon", "badge"]);
  });

  it("visible: a cue in the foreground, never a sound or a notification", () => {
    expect(route(event("entered"), settings("entered", "visible"), ctx())).toEqual(["counter", "cue"]);
    expect(route(event("entered"), settings("entered", "visible"), ctx({ visible: false, desktop: true }))).toEqual(["counter", "title", "favicon", "badge"]);
  });

  it("loud: toast and sound in the foreground; in the background also the desktop notification when allowed", () => {
    expect(route(event("message"), settings("message", "loud"), ctx())).toEqual(["counter", "cue", "toast", "sound"]);
    expect(route(event("message"), settings("message", "loud"), ctx({ visible: false }))).toEqual(["counter", "title", "favicon", "badge", "toast", "sound"]);
    expect(route(event("message"), settings("message", "loud"), ctx({ visible: false, desktop: true }))).toContain("desktop");
  });

  it("no sound and no toast while speaking, except for a nudge", () => {
    expect(route(event("message"), settings("message", "loud"), ctx({ speaking: true }))).toEqual(["counter", "cue"]);
    expect(route(event("nudge"), settings("nudge", "loud"), ctx({ speaking: true }))).toContain("sound");
  });

  it("a bundled event does not play the sound again", () => {
    expect(route(event("entered", { count: 3 }), settings("entered", "loud"), ctx())).toEqual(["counter", "cue", "toast"]);
  });
});

describe("do not disturb", () => {
  it("caps everything at quiet", () => {
    expect(effectiveLevel("message", DEFAULT_SETTINGS, { doNotDisturb: true })).toBe("quiet");
    expect(effectiveLevel("entered", DEFAULT_SETTINGS, { doNotDisturb: true })).toBe("quiet");
    expect(route(event("message"), DEFAULT_SETTINGS, ctx({ doNotDisturb: true }))).toEqual(["counter"]);
  });

  it("does not raise a lower level, nor change one that is off", () => {
    expect(effectiveLevel("board", DEFAULT_SETTINGS, { doNotDisturb: true })).toBe("quiet");
    expect(effectiveLevel("board", settings("board", "off"), { doNotDisturb: true })).toBe("off");
  });

  it("lets the nudge ring through, unless it is switched off", () => {
    expect(effectiveLevel("nudge", DEFAULT_SETTINGS, { doNotDisturb: true })).toBe("loud");
    expect(route(event("nudge"), DEFAULT_SETTINGS, ctx({ doNotDisturb: true }))).toContain("sound");
    expect(route(event("nudge"), settings("nudge", "off"), ctx({ doNotDisturb: true }))).toEqual([]);
  });
});

describe("flashes and sticky", () => {
  it("flashes the title only for a loud event in the background", () => {
    expect(flashes(event("message"), DEFAULT_SETTINGS, ctx({ visible: false }))).toBe(true);
    expect(flashes(event("message"), DEFAULT_SETTINGS, ctx())).toBe(false);
    expect(flashes(event("board"), DEFAULT_SETTINGS, ctx({ visible: false }))).toBe(false);
    expect(flashes(event("message"), DEFAULT_SETTINGS, ctx({ visible: false, doNotDisturb: true }))).toBe(false);
  });

  it("keeps only the nudge notification until clicked", () => {
    expect(sticky(event("nudge"))).toBe(true);
    expect(sticky(event("message"))).toBe(false);
  });
});

describe("bundle", () => {
  it("stands alone without a predecessor, of another kind, or after the window", () => {
    const next = event("entered", { at: 5000 });
    expect(bundle(null, next)).toBe(next);
    expect(bundle(event("board", { at: 4000 }), next)).toBe(next);
    expect(bundle(event("entered", { at: 5000 - BUNDLE_MS - 1 }), next)).toBe(next);
  });

  it("joins events of one kind within the window, counting them and keeping a few distinct names", () => {
    let joined = bundle(event("entered", { at: 1000, who: ["Anna"] }), event("entered", { at: 2000, who: ["Ben"] }));
    expect(joined).toEqual({ kind: "entered", at: 2000, who: ["Anna", "Ben"], count: 2 });
    joined = bundle(joined, event("entered", { at: 3000, who: ["Anna", "Cleo"] }));
    expect(joined.who).toEqual(["Anna", "Ben", "Cleo"]);
    expect(joined.count).toBe(3);
    joined = bundle(joined, event("entered", { at: 4000, who: ["Dora"] }));
    expect(joined.who).toEqual(["Anna", "Ben", "Cleo"]);
    expect(joined.count).toBe(4);
  });
});

describe("title and badge", () => {
  it("puts the count in front of the title", () => {
    expect(titleWithCount("Ruumble", 0)).toBe("Ruumble");
    expect(titleWithCount("Ruumble", 2)).toBe("(2) Ruumble");
    expect(titleWithCount("Ruumble", 150)).toBe("(99+) Ruumble");
  });

  it("cycles the flashing title between the marked message and the calm title", () => {
    expect(flashFrames("Ruumble", "Anna nudged you", 1, 2)).toEqual(["● Anna nudged you", "(1) Ruumble", "● Anna nudged you", "(1) Ruumble"]);
    expect(flashFrames("Ruumble", "x", 0)).toHaveLength(6);
  });

  it("limits the badge to 0–99", () => {
    expect(badgeCount(-3)).toBe(0);
    expect(badgeCount(4.7)).toBe(4);
    expect(badgeCount(500)).toBe(99);
  });
});

describe("settings", () => {
  it("round-trips", () => {
    const changed: Settings = { levels: { ...DEFAULT_SETTINGS.levels, board: "off", entered: "loud" }, desktop: true, desktopText: true, doNotDisturb: true };
    expect(parseSettings(serializeSettings(changed))).toEqual(changed);
  });

  it("falls back to the defaults for nothing, garbage, or the wrong shape", () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("{nope")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("42")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("null")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ levels: "x", desktop: "yes", desktopText: 1, doNotDisturb: "no" }))).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps the valid parts and defaults the invalid ones", () => {
    const parsed = parseSettings(JSON.stringify({ levels: { board: "loud", entered: "shout", message: 3 }, desktop: true }));
    expect(parsed.levels.board).toBe("loud");
    expect(parsed.levels.entered).toBe(DEFAULT_SETTINGS.levels.entered);
    expect(parsed.levels.message).toBe(DEFAULT_SETTINGS.levels.message);
    expect(parsed.desktop).toBe(true);
  });

  it("does not hand out the shared defaults to be modified", () => {
    parseSettings(null).levels.board = "loud";
    expect(DEFAULT_SETTINGS.levels.board).toBe("quiet");
  });
});
