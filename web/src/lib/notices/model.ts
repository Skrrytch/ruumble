/**
 * Notices (ADR-0023), the pure part: which output channels an event uses, bundling of similar events, the text of the
 * tab title and the per-browser settings. Nothing here touches the browser; the channels and the centre that listens
 * to the sources are separate.
 */

export type NoticeKind = "entered" | "nudge" | "board" | "parcel" | "parcel-to-me" | "message";
export type Level = "off" | "quiet" | "visible" | "loud";
export type ChannelId = "counter" | "cue" | "toast" | "sound" | "title" | "favicon" | "badge" | "desktop";

export const NOTICE_KINDS: readonly NoticeKind[] = ["entered", "nudge", "board", "parcel", "parcel-to-me", "message"];
export const LEVELS: readonly Level[] = ["off", "quiet", "visible", "loud"];

export interface NoticeEvent {
  kind: NoticeKind;
  /** when it happened, ms */
  at: number;
  /** who it is about or from; shown by the texts, never used by the policy */
  who: string[];
  /** how many events were bundled into this one */
  count: number;
}

export interface Context {
  /** the tab is in the foreground */
  visible: boolean;
  /** the own status says "do not disturb" */
  doNotDisturb: boolean;
  /** the own user is talking right now */
  speaking: boolean;
  /** desktop notifications are switched on in the settings and the permission is granted */
  desktop: boolean;
}

export interface Settings {
  levels: Record<NoticeKind, Level>;
  /** use desktop notifications (asks for the permission when switched on) */
  desktop: boolean;
  /** show the text of a message in a desktop notification instead of just who it is from */
  desktopText: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  levels: { entered: "visible", nudge: "loud", board: "quiet", parcel: "visible", "parcel-to-me": "loud", message: "loud" },
  desktop: false,
  desktopText: false,
};

export const BUNDLE_MS = 10_000;
const NAMES_KEPT = 3;

const ORDER: Record<Level, number> = { off: 0, quiet: 1, visible: 2, loud: 3 };

/** the level an event is actually treated with: the setting, capped by "do not disturb", except for a nudge */
export function effectiveLevel(kind: NoticeKind, settings: Settings, ctx: Pick<Context, "doNotDisturb">): Level {
  const level = settings.levels[kind];
  if (ctx.doNotDisturb && kind !== "nudge" && ORDER[level] > ORDER.quiet) return "quiet";
  return level;
}

/** the output channels for an event; empty when the kind is switched off */
export function route(event: NoticeEvent, settings: Settings, ctx: Context): ChannelId[] {
  const level = effectiveLevel(event.kind, settings, ctx);
  if (level === "off") return [];
  const channels: ChannelId[] = ["counter"];
  if (ctx.visible) {
    if (ORDER[level] >= ORDER.visible) channels.push("cue");
    if (level === "loud") channels.push("toast", "sound");
  } else {
    channels.push("title", "favicon", "badge");
    if (level === "loud") channels.push("toast", "sound");
    if (level === "loud" && ctx.desktop) channels.push("desktop");
  }
  // being spoken to must not be drowned by a sound or a toast popping up while talking
  const quietWhileSpeaking = ctx.speaking && event.kind !== "nudge";
  return channels.filter((c) => !(quietWhileSpeaking && (c === "sound" || c === "toast")) && !(event.count > 1 && c === "sound"));
}

/** whether a title flashes for this event (only loud ones, and only while the tab is hidden) */
export function flashes(event: NoticeEvent, settings: Settings, ctx: Context): boolean {
  return !ctx.visible && effectiveLevel(event.kind, settings, ctx) === "loud";
}

/** whether a desktop notification of this event stays until clicked (the nudge only) */
export function sticky(event: NoticeEvent): boolean {
  return event.kind === "nudge";
}

/** join an event to the one before it when it is of the same kind and close in time; otherwise it stands alone */
export function bundle(previous: NoticeEvent | null, next: NoticeEvent, windowMs = BUNDLE_MS): NoticeEvent {
  if (!previous || previous.kind !== next.kind || next.at - previous.at > windowMs) return next;
  const who = [...previous.who];
  for (const name of next.who) if (!who.includes(name)) who.push(name);
  return { kind: next.kind, at: next.at, who: who.slice(0, NAMES_KEPT), count: previous.count + next.count };
}

/** the tab title with the number of unseen notices: "(2) Place · Ruumble" */
export function titleWithCount(base: string, unseen: number): string {
  return unseen > 0 ? `(${unseen > 99 ? "99+" : unseen}) ${base}` : base;
}

/** the titles a flashing tab cycles through: the marked message, then the normal title, `times` rounds */
export function flashFrames(base: string, message: string, unseen: number, times = 3): string[] {
  const calm = titleWithCount(base, unseen);
  return Array.from({ length: times }, () => [`● ${message}`, calm]).flat();
}

/** the badge number of the installed app; 0 clears it */
export function badgeCount(unseen: number): number {
  return Math.max(0, Math.min(99, Math.floor(unseen)));
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify(settings);
}

/** settings from what the browser stored; anything missing or broken falls back to the default */
export function parseSettings(raw: string | null): Settings {
  const fallback: Settings = { ...DEFAULT_SETTINGS, levels: { ...DEFAULT_SETTINGS.levels } };
  if (!raw) return fallback;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (typeof data !== "object" || data === null) return fallback;
  const { levels, desktop, desktopText } = data as Record<string, unknown>;
  if (typeof levels === "object" && levels !== null) {
    for (const kind of NOTICE_KINDS) {
      const level = (levels as Record<string, unknown>)[kind];
      if (typeof level === "string" && (LEVELS as readonly string[]).includes(level)) fallback.levels[kind] = level as Level;
    }
  }
  if (typeof desktop === "boolean") fallback.desktop = desktop;
  if (typeof desktopText === "boolean") fallback.desktopText = desktopText;
  return fallback;
}
