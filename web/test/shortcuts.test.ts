// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { shortcutOf } from "../src/lib/shortcuts.ts";

const key = (k: string, extra: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean; repeat: boolean; target: EventTarget | null }> = {}) =>
  ({ key: k, ctrlKey: false, altKey: false, metaKey: false, repeat: false, target: document.body, ...extra });

describe("keyboard shortcuts", () => {
  it("B toggles the board, upper or lower case; H (house, Haus) opens the building overview, S the status", () => {
    expect(shortcutOf(key("b"), false)).toBe("toggleBoard");
    expect(shortcutOf(key("B"), false)).toBe("toggleBoard");
    expect(shortcutOf(key("h"), false)).toBe("overview");
    expect(shortcutOf(key("s"), false)).toBe("status");
    expect(shortcutOf(key("x"), false)).toBeNull();
  });

  it("never with Ctrl, Alt or Meta, while holding the key, in a modal dialog or while typing", () => {
    expect(shortcutOf(key("b", { ctrlKey: true }), false)).toBeNull();
    expect(shortcutOf(key("b", { altKey: true }), false)).toBeNull();
    expect(shortcutOf(key("b", { metaKey: true }), false)).toBeNull();
    expect(shortcutOf(key("b", { repeat: true }), false)).toBeNull();
    expect(shortcutOf(key("b"), true)).toBeNull();
    for (const tag of ["input", "textarea", "select"]) expect(shortcutOf(key("b", { target: document.createElement(tag) }), false)).toBeNull();
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true"); // jsdom does not reflect the contentEditable property
    document.body.append(editable);
    expect(shortcutOf(key("b", { target: editable }), false)).toBeNull();
    expect(shortcutOf(key("b", { target: null }), false)).toBe("toggleBoard");
  });
});
