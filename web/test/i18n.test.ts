// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { de } from "../src/lib/i18n/de.ts";
import { en } from "../src/lib/i18n/en.ts";
import { detectLocale, intlLocale, locale, setLocale, t } from "../src/lib/i18n/index.svelte.ts";
import { countText, floorLabels } from "../src/lib/model/building.ts";
import { formatSize, pastedName, relativeTime } from "../src/lib/board/model.ts";

/** all entries as path → value, functions called with sample values */
function flatten(o: object, path = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    const p = path ? `${path}.${k}` : k;
    if (typeof v === "function") out[p] = String((v as (...a: unknown[]) => unknown)(2, "x", null));
    else if (Array.isArray(v)) out[p] = v.join("");
    else if (v && typeof v === "object") Object.assign(out, flatten(v, p));
    else out[p] = String(v);
  }
  return out;
}

describe("UI language", () => {
  afterEach(() => setLocale("en", false));

  it("German, otherwise English: first supported browser language", () => {
    expect(detectLocale(["de-DE", "en"])).toBe("de");
    expect(detectLocale(["de-AT"])).toBe("de");
    expect(detectLocale(["en-US", "de"])).toBe("en");
    expect(detectLocale(["fr-FR", "de-CH"])).toBe("de");
    expect(detectLocale(["fr-FR", "es"])).toBe("en");
    expect(detectLocale([])).toBe("en");
  });

  it("both dictionaries have the same entries, none empty", () => {
    const d = flatten(de);
    const e = flatten(en);
    expect(Object.keys(e).sort()).toEqual(Object.keys(d).sort());
    for (const [k, v] of Object.entries({ ...d, ...e })) expect(v.trim(), k).not.toBe("");
  });

  it("switching affects texts, number format and <html lang>, and is remembered", () => {
    setLocale("de");
    expect(locale()).toBe("de");
    expect(document.documentElement.lang).toBe("de");
    expect(localStorage.getItem("ruumble.locale")).toBe("de");
    expect(intlLocale()).toBe("de-DE");
    expect(t().board.title).toBe("Pinnwand");
    expect([0, 1, 2].map((n) => t().board.count(n))).toEqual(["Noch keine Beiträge", "1 Beitrag", "2 Beiträge"]);
    expect([0, 1, 2].map(countText)).toEqual(["frei", "1 Person", "2 Personen"]);
    expect(floorLabels(0)).toEqual({ level: "Erdgeschoss", badge: "EG" });
    expect(floorLabels(2)).toEqual({ level: "2. Obergeschoss", badge: "2" });
    expect(formatSize(1.25 * 1024 * 1024)).toBe("1,3 MB");
    expect(pastedName({ name: "", type: "image/png" }, new Date(2026, 8, 28, 9, 5))).toBe("bild-2026-09-28-0905.png");
    const now = 10 * 24 * 3600_000;
    expect([20_000, 5 * 60_000, 3 * 3600_000, 26 * 3600_000, 4 * 24 * 3600_000].map((ago) => relativeTime(now - ago, now))).toEqual([
      "Gerade eben", "vor 5 Min.", "vor 3 Std.", "gestern", "vor 4 Tagen",
    ]);
    setLocale("en");
    expect(t().board.title).toBe("Board");
    expect(intlLocale()).toBe("en-GB");
    expect(localStorage.getItem("ruumble.locale")).toBe("en");
  });

  it("versions on the notice pages, plugin only if one is offered", () => {
    expect(en.pluginHelp.versions("0.8.3", "0.4.1")).toBe("Ruumble service 0.8.3 · plugin 0.4.1");
    expect(en.pluginHelp.versions("0.8.3", null)).toBe("Ruumble service 0.8.3");
    expect(de.pluginHelp.versions("0.8.3", "0.4.1")).toBe("Ruumble-Dienst 0.8.3 · Plugin 0.4.1");
    expect(de.pluginHelp.versions("0.8.3", null)).toBe("Ruumble-Dienst 0.8.3");
  });

  it("English ordinals and plurals", () => {
    expect(countText(0)).toBe("free");
    expect(countText(3)).toBe("3 people");
    expect(floorLabels(0)).toEqual({ level: "Ground floor", badge: "G" });
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map((n) => floorLabels(n).level)).toEqual([
      "1st floor", "2nd floor", "3rd floor", "4th floor", "11th floor", "12th floor", "13th floor", "21st floor", "22nd floor",
    ]);
    const now = 10 * 24 * 3600_000;
    expect(relativeTime(now - 3 * 3600_000, now)).toBe("3 hours ago");
    expect(relativeTime(now - 3600_000, now)).toBe("1 hour ago");
  });
});
