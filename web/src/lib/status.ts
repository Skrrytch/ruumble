/**
 * The status at the avatar (B, ADR-0018): how its expiry and the tooltip read, in the web UI's language.
 */
import { intlLocale, t } from "./i18n/index.svelte.ts";
import type { UserView } from "./model/building.ts";

/** "14:30" today, "Mon 09:00" on another day */
export function untilTime(until: number, now = Date.now()): string {
  const same = new Date(until).toDateString() === new Date(now).toDateString();
  return new Intl.DateTimeFormat(intlLocale(), same ? { hour: "2-digit", minute: "2-digit" } : { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(until);
}

/** "until 14:30" or "no expiry" */
export function expiryText(until: number | null, now = Date.now()): string {
  return until === null ? t().status.noExpiry : t().status.until(untilTime(until, now));
}

/** tooltip of the status bubble: "Status: Lunch break (until 14:30)" */
export function statusLabel(status: NonNullable<UserView["status"]>, now = Date.now()): string {
  const text = t().people.status(status.text);
  return status.until === null ? text : `${text} (${expiryText(status.until, now)})`;
}
