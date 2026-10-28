/**
 * The app badge channel (ADR-0023): the number at the icon of the installed app. Without support (Firefox) or without the
 * installed app the call is missing, rejected, or has no effect; none of that is an error.
 */
import { badgeCount } from "../model.ts";

export function setBadge(unseen: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  const count = badgeCount(unseen);
  try {
    const done = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
    void done?.catch(() => {});
  } catch {
    /* not supported here */
  }
}
