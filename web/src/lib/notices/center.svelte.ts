/**
 * The notice centre (ADR-0023): the sources report what happened, the policy in model.ts says which channels to use, and
 * the channels do it. This step covers the channels that work outside the tab: title, favicon and app badge.
 */
import { t } from "../i18n/index.svelte.ts";
import { playNudgeSound } from "../nudge.ts";
import { setBadge } from "./channels/badge.ts";
import { desktopPermission, requestDesktopPermission, showDesktop, type DesktopPermission } from "./channels/desktop.ts";
import { setFaviconDot } from "./channels/favicon.ts";
import { TitleChannel } from "./channels/title.ts";
import { bundle, flashes, parseSettings, route, serializeSettings, sticky, type Context, type Level, type NoticeEvent, type NoticeKind, type Settings } from "./model.ts";

const SETTINGS_KEY = "ruumble.notices";

const LEGACY_NUDGE_SOUND_KEY = "ruumble.nudgeSound";

function readSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    const settings = parseSettings(stored);
    // "Sound when nudged: off" of before the notices (ADR-0020) becomes the nudge being off
    if (stored === null && localStorage.getItem(LEGACY_NUDGE_SOUND_KEY) === "off") settings.levels.nudge = "off";
    return settings;
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
  settings = $state(readSettings());
  /** the browser's answer to the permission question, as of the last look */
  permission = $state<DesktopPermission>(desktopPermission());

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

  setLevel(kind: NoticeKind, level: Level): void {
    this.settings.levels[kind] = level;
    this.save();
  }

  setDoNotDisturb(on: boolean): void {
    this.settings.doNotDisturb = on;
    this.save();
  }

  setDesktopText(on: boolean): void {
    this.settings.desktopText = on;
    this.save();
  }

  /** switching on asks the browser for the permission; without it the switch stays off */
  async setDesktop(on: boolean): Promise<void> {
    if (on) {
      this.permission = await requestDesktopPermission();
      on = this.permission === "granted";
    }
    this.settings.desktop = on;
    this.save();
  }

  /** something happened that concerns the room or the own user; `text` is the message, shown only if the user wants it */
  notify(kind: NoticeKind, who: string, text?: string, now = Date.now()): void {
    const event = bundle(this.last, { kind, at: now, who: [who], count: 1 });
    this.last = event;
    const ctx = this.context();
    const channels = route(event, this.settings, ctx);
    if (channels.includes("sound")) playNudgeSound();
    if (!channels.includes("title")) return; // in front, or switched off: the channels in the room come with the next step
    // a bundled event counts once more, not again as a whole
    this.unseen += 1;
    const { one, many } = t().notices.flash[kind];
    const message = event.count > 1 ? many(event.count) : one(who);
    this.title.set(this.unseen, flashes(event, this.settings, ctx) ? message : undefined);
    if (channels.includes("desktop")) {
      showDesktop({ title: message, body: this.settings.desktopText ? text : undefined, tag: kind, sticky: sticky(event) });
    }
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
    return {
      visible: this.foreground(),
      doNotDisturb: this.settings.doNotDisturb,
      speaking: this.host.speaking(),
      desktop: this.settings.desktop && desktopPermission() === "granted",
    };
  }

  private save(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, serializeSettings(this.settings));
    } catch {
      /* private mode: only until reload */
    }
  }
}
