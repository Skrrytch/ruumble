import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { Snapshot } from "@ruumble/protocol";
import { setLocale } from "../src/lib/i18n/index.svelte.ts";
import { buildBuilding } from "../src/lib/model/building.ts";
import { expiryText, statusLabel, untilTime } from "../src/lib/status.ts";

const sample = Snapshot.parse(JSON.parse(readFileSync(new URL("../../protocol/fixtures/sample.json", import.meta.url), "utf8")));

afterEach(() => setLocale("en", false));

describe("Status at the avatar (B, ADR-0018)", () => {
  it("the snapshot's status and \"uses Ruumble\" reach the person, missing means none", () => {
    const users = buildBuilding(sample).floors.flatMap((f) => [...f.rooms, f.corridor].flatMap((s) => s.users));
    expect(users.find((u) => u.name === "Clara")!.status).toEqual({ text: "Focus time, please write", until: null });
    expect(users.find((u) => u.name === "Anna")!.status).toBeNull();
    // uses Ruumble: plugin connected
    expect(users.find((u) => u.name === "Clara")!.usesRuumble).toBe(true);
    expect(users.find((u) => u.name === "David")!.usesRuumble).toBe(false);
  });

  it("expiry: the time today, the weekday on another day, or no expiry", () => {
    const now = new Date(2026, 9, 5, 12, 0).getTime();
    expect(untilTime(new Date(2026, 9, 5, 14, 30).getTime(), now)).toBe("14:30");
    expect(untilTime(new Date(2026, 9, 6, 9, 0).getTime(), now)).toBe("Tue 09:00");
    expect(expiryText(null)).toBe("no expiry");
    expect(statusLabel({ text: "Lunch", until: new Date(2026, 9, 5, 14, 30).getTime() }, now)).toBe("Status: Lunch (until 14:30)");
    expect(statusLabel({ text: "Away", until: null })).toBe("Status: Away");
    setLocale("de", false);
    expect(statusLabel({ text: "Mittag", until: new Date(2026, 9, 6, 9, 0).getTime() }, now)).toBe("Status: Mittag (bis Di., 09:00)");
  });
});
