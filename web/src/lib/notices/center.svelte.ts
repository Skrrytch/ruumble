/**
 * The notice centre (ADR-0023): the sources report what happened, the policy in model.ts says which channels to use, and
 * the channels do it. This step covers the channels that work outside the tab: title, favicon and app badge.
 */
import { t } from "../i18n/index.svelte.ts";
import { setBadge } from "./channels/badge.ts";
import { setFaviconDot } from "./channels/favicon.ts";
import { TitleChannel } from "./channels/title.ts";
import { bundle, flashes, parseSettings, route, type Context, type NoticeEvent, type NoticeKind, type Settings } from "./model.ts";

const SETTINGS_KEY = "ruumble.notices";

function readSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return parseSettings(null);
  }
}

export interface NoticeHost {
  /** the own user is talking right now */
  speaking(): boolean;
}

export class NoticeCenter {
  /** how many notices came while the window was in the background and have not been seen yet */
  unseen = $state(0);
  settings = readSettings();

  private readonly title = new TitleChannel();
  private last: NoticeEvent | null = null;
  private readonly cleanup: (() => void)[] = [];

  constructor(private readonly host: NoticeHost) {}

  start(): void {
    const seen = () => {
      if (this.foreground()) this.clear();
    };
    document.addEventListener("visibilitychange", seen);
    addEventListener("focus", seen);
    this.cleanup.push(() => document.removeEventListener("visibilitychange", seen), () => removeEventListener("focus", seen));
  }

  stop(): void {
    for (const fn of this.cleanup.splice(0)) fn();
  }

  /** the window is in front and has the focus: someone is looking */
  foreground(): boolean {
    return document.visibilityState === "visible" && document.hasFocus();
  }

  /** the tab title without the count, as the place the user is in gives it */
  setBaseTitle(base: string): void {
    this.title.setBase(base);
  }

  /** something happened that concerns the room or the own user */
  notify(kind: NoticeKind, who: string, now = Date.now()): void {
    const event = bundle(this.last, { kind, at: now, who: [who], count: 1 });
    this.last = event;
    const ctx = this.context();
    const channels = route(event, this.settings, ctx);
    if (!channels.includes("title")) return; // in front, or switched off: the channels in the room come with the next step
    // a bundled event counts once more, not again as a whole
    this.unseen += 1;
    const { one, many } = t().notices.flash[kind];
    this.title.set(this.unseen, flashes(event, this.settings, ctx) ? (event.count > 1 ? many(event.count) : one(who)) : undefined);
    if (channels.includes("favicon")) void setFaviconDot(true);
    if (channels.includes("badge")) setBadge(this.unseen);
  }

  private clear(): void {
    if (this.unseen === 0) return;
    this.unseen = 0;
    this.last = null;
    this.title.set(0);
    void setFaviconDot(false);
    setBadge(0);
  }

  private context(): Context {
    // "do not disturb" has no status to read yet, and desktop notifications come with their own step
    return { visible: this.foreground(), doNotDisturb: false, speaking: this.host.speaking(), desktop: false };
  }
}
