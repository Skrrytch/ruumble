// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { de } from "../src/lib/i18n/de.ts";
import { en } from "../src/lib/i18n/en.ts";
import { detectLocale, intlLocale, locale, setLocale, t } from "../src/lib/i18n/index.svelte.ts";
import { countText, floorLabels } from "../src/lib/model/building.ts";
import { relativeTime } from "../src/lib/board/model.ts";

/** alle Einträge als Pfad → Wert, Funktionen mit Beispielwerten aufgerufen */
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

describe("Sprache der Oberfläche", () => {
  afterEach(() => setLocale("de", false));

  it("Deutsch, sonst Englisch: erste unterstützte Sprache des Browsers", () => {
    expect(detectLocale(["de-DE", "en"])).toBe("de");
    expect(detectLocale(["de-AT"])).toBe("de");
    expect(detectLocale(["en-US", "de"])).toBe("en");
    expect(detectLocale(["fr-FR", "de-CH"])).toBe("de");
    expect(detectLocale(["fr-FR", "es"])).toBe("en");
    expect(detectLocale([])).toBe("en");
  });

  it("beide Wörterbücher haben dieselben Einträge, keiner ist leer", () => {
    const d = flatten(de);
    const e = flatten(en);
    expect(Object.keys(e).sort()).toEqual(Object.keys(d).sort());
    for (const [k, v] of Object.entries({ ...d, ...e })) expect(v.trim(), k).not.toBe("");
  });

  it("Umschalten wirkt auf Texte, Zahlenformat und <html lang>, und wird gemerkt", () => {
    setLocale("en");
    expect(locale()).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("ruumble.locale")).toBe("en");
    expect(intlLocale()).toBe("en-GB");
    expect(t().board.title).toBe("Board");
    expect(countText(0)).toBe("free");
    expect(countText(3)).toBe("3 people");
    expect(floorLabels(0)).toEqual({ level: "Ground floor", badge: "G" });
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map((n) => floorLabels(n).level)).toEqual([
      "1st floor", "2nd floor", "3rd floor", "4th floor", "11th floor", "12th floor", "13th floor", "21st floor", "22nd floor",
    ]);
    const now = 10 * 24 * 3600_000;
    expect(relativeTime(now - 3 * 3600_000, now)).toBe("3 hours ago");
    expect(relativeTime(now - 3600_000, now)).toBe("1 hour ago");
    setLocale("de");
    expect(t().board.title).toBe("Pinnwand");
    expect(intlLocale()).toBe("de-DE");
  });
});
