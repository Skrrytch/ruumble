/**
 * Colour theme of the web UI: light or dark. Follows the system setting (`prefers-color-scheme`) until a choice in
 * the user area overrides it; the choice is remembered in the browser. The theme is the `data-theme` attribute on
 * <html>, which tokens.css reads; public/theme.js sets it before the first paint with the same rule.
 */
export type Theme = "light" | "dark";
const STORAGE_KEY = "ruumble.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** the remembered choice wins, otherwise the system setting */
export function resolveTheme(stored: string | null | undefined, systemDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return systemDark ? "dark" : "light";
}

function stored(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

const media = globalThis.matchMedia?.(DARK_QUERY);
let current = $state<Theme>(resolveTheme(stored(), media?.matches ?? false));
apply();

// without a choice of its own the UI follows the system, also while it is open (e.g. automatic switch at night)
media?.addEventListener?.("change", (e) => {
  if (stored() !== null) return;
  current = e.matches ? "dark" : "light";
  apply();
});

function apply(): void {
  if (typeof document !== "undefined") document.documentElement.dataset.theme = current;
}

export function theme(): Theme {
  return current;
}

export function setTheme(next: Theme, remember = true): void {
  current = next;
  apply();
  if (!remember) return;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // private mode or similar: then only applies until reload
  }
}
