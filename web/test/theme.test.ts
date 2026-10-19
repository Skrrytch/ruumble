// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { resolveTheme, setTheme, theme } from "../src/lib/theme.svelte.ts";

describe("colour theme", () => {
  afterEach(() => localStorage.clear());

  it("a remembered choice wins, otherwise the system setting", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("sepia", true)).toBe("dark"); // anything else counts as no choice
  });

  it("switching sets data-theme on <html> and remembers the choice", () => {
    setTheme("dark");
    expect(theme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("ruumble.theme")).toBe("dark");
    setTheme("light", false);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("ruumble.theme")).toBe("dark"); // not remembered
  });
});
