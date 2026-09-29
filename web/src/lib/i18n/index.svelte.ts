/**
 * Language of the web UI: German, otherwise English (browser setting, `navigator.languages`).
 * A choice in the user area overrides this and is remembered in the browser.
 * `t()` returns the dictionary of the current language and is reactive (reads `$state`).
 */
import { de } from "./de.ts";
import { en } from "./en.ts";
import type { Messages } from "./de.ts";

export type Locale = "de" | "en";
export const LOCALES: readonly Locale[] = ["de", "en"];
const DICTIONARIES: Record<Locale, Messages> = { de, en };
const STORAGE_KEY = "ruumble.locale";

/** first supported language from the browser's list; English if none matches */
export function detectLocale(languages: readonly string[] = globalThis.navigator?.languages ?? []): Locale {
  for (const l of languages) {
    const base = l.toLowerCase().split("-")[0];
    if (base === "de" || base === "en") return base;
  }
  return "en";
}

function stored(): Locale | null {
  try {
    const v = globalThis.localStorage?.getItem(STORAGE_KEY);
    return v === "de" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

let current = $state<Locale>(stored() ?? detectLocale());
if (typeof document !== "undefined") document.documentElement.lang = current;

export function locale(): Locale {
  return current;
}

export function setLocale(next: Locale, remember = true): void {
  current = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  if (!remember) return;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // private mode or similar: then only applies until reload
  }
}

/** Dictionary of the current language */
export function t(): Messages {
  return DICTIONARIES[current];
}

/** BCP 47 tag for Intl (dates, numbers, sorting) */
export function intlLocale(): string {
  return current === "de" ? "de-DE" : "en-GB";
}
