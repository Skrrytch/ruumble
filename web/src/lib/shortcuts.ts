/**
 * Keyboard shortcuts: single keys without Ctrl, Alt or Meta (those clash with the browser, e.g. Ctrl+B,
 * Alt+B), like GitHub or Gmail. They never apply while typing or while a modal dialog is open.
 */
export type Shortcut = "toggleBoard" | "overview" | "status";

/** key (lower case) → action; the key is also shown in the tooltips */
export const SHORTCUT_KEYS: Record<Shortcut, string> = { toggleBoard: "b", overview: "h", status: "s" };

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
  target: EventTarget | null;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || !!el.closest('[contenteditable]:not([contenteditable="false"])');
}

export function shortcutOf(e: KeyLike, modalOpen: boolean): Shortcut | null {
  if (e.ctrlKey || e.altKey || e.metaKey || e.repeat || modalOpen || isTyping(e.target)) return null;
  const key = e.key.toLowerCase();
  return (Object.keys(SHORTCUT_KEYS) as Shortcut[]).find((s) => SHORTCUT_KEYS[s] === key) ?? null;
}
