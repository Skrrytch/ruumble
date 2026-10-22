/**
 * How a person reads in tooltips and labels, in the web UI's language: the avatar's label with every state, and the
 * status at the avatar (B, ADR-0018) with its expiry.
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

/** tooltip of the status tag at the avatar: "Lunch break (until 14:30)" */
export function statusText(status: NonNullable<UserView["status"]>, now = Date.now()): string {
  return status.until === null ? status.text : `${status.text} (${expiryText(status.until, now)})`;
}

/** the status within the avatar's label, where it needs saying what it is: "Status: Lunch break (until 14:30)" */
export function statusLabel(status: NonNullable<UserView["status"]>, now = Date.now()): string {
  return t().people.status(statusText(status, now));
}

/** the avatar's label: name, mute, talking, presence, recording, without Ruumble, status ("Anna (you), muted, …") */
export function personLabel(user: UserView, talking = false, now = Date.now()): string {
  const p = t().people;
  // whoever is talking is active – whatever idlesecs says (AP10)
  const presence = talking ? "active" : user.presence;
  return [
    user.name + (user.isSelf ? ` (${p.you})` : ""),
    user.selfDeafened ? p.deaf : user.selfMuted ? p.muted : null,
    user.serverMuted ? p.serverMuted : null,
    talking ? p.talking : null,
    presence === "away" ? p.away : presence === "quiet" ? p.quiet(user.idleMinutes) : null,
    user.recording ? p.recording : null,
    user.usesRuumble ? null : p.withoutRuumble,
    user.status ? statusLabel(user.status, now) : null,
  ]
    .filter(Boolean)
    .join(", ");
}
