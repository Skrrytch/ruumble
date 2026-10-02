/** Board: pure helper functions without DOM (ADR-0011, AP11.2). */
import { REACTION_KINDS, type Channel, type Post, type PostKind, type Reaction, type ReactionKind } from "@ruumble/protocol";
import { intlLocale, t } from "../i18n/index.svelte.ts";
import type { Building } from "../model/building.ts";

export type BoardFilter = "all" | PostKind;

/** Sidebar filters; the labels are in `t().board.filters` */
export const FILTERS: readonly BoardFilter[] = ["all", "text", "code", "image", "file"];

/** kind filter and free-text search (not case-sensitive) over text, caption, file name, code language and author */
export function filterPosts(posts: readonly Post[], filter: BoardFilter, query = ""): Post[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return posts.filter((p) => {
    if (filter !== "all" && p.kind !== filter) return false;
    if (!words.length) return true;
    const haystack = [p.text, p.attachment?.name, p.language, p.authorName].filter(Boolean).join("\n").toLocaleLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

/** longest title of a post kept on top (A3, like the service's PinRequest) */
export const PIN_TITLE_MAX = 40;

/**
 * Suggested title for keeping a post on top (A3): the first heading, otherwise the first line, without Markdown
 * markers; code: its first line; attachments without a caption: the file name. At most PIN_TITLE_MAX characters.
 */
export function suggestTitle(post: Post): string {
  const source = post.text.trim() ? post.text : (post.attachment?.name ?? "");
  const lines = source.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let line = post.kind === "code" ? (lines[0] ?? "") : (lines.find((l) => /^#{1,6}\s+\S/.test(l)) ?? lines[0] ?? "");
  if (post.kind !== "code") {
    line = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^(?:[-*+>]\s+)?(?:\[[ xX]?\]\s+)?/, "") // list, quote, task marker
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) → text
      .replace(/(\*\*|__|~~|`|\*|_)/g, "")
      .trim();
  }
  if (!line) return t().board.kinds[post.kind];
  return line.length > PIN_TITLE_MAX ? `${line.slice(0, PIN_TITLE_MAX - 1).trimEnd()}…` : line;
}

/** compact summary for the card header: the `max` most frequent kinds (ties in the fixed order), total, own among them */
export function summarizeReactions(reactions: readonly Reaction[], max = 3): { top: ReactionKind[]; total: number; mine: boolean } {
  const order = (k: ReactionKind) => REACTION_KINDS.indexOf(k);
  const top = [...reactions].sort((a, b) => b.count - a.count || order(a.kind) - order(b.kind)).slice(0, max).map((r) => r.kind);
  return { top, total: reactions.reduce((n, r) => n + r.count, 0), mine: reactions.some((r) => r.mine) };
}

/**
 * Does pasted text look like source code? Then the web UI suggests “pin as code”.
 * Deliberately cautious: multi-line and several typical features.
 */
export function looksLikeCode(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return false;
  if (/^```/m.test(text)) return false; // already Markdown with a code block
  // several lines with a shell prompt ($ or #) are unambiguous on their own
  if (lines.filter((l) => /^\s*[$#] \S/.test(l)).length >= 2) return true;
  let score = 0;
  const indented = lines.filter((l) => /^(\t| {2,})\S/.test(l)).length;
  if (indented >= Math.max(1, lines.length / 4)) score++;
  if (lines.filter((l) => /[;{}]\s*$/.test(l)).length >= 2) score++;
  if (/^\s*(import|from|export|package|using|#include|def|class|function|fn|func|public|private|const|let|var|return|if|for|while)\b/m.test(text)) score++;
  if (/(=>|::|->|===|!==|\+\+|&&|\|\|)/.test(text)) score++;
  if (/^\s*[<{\[][\s\S]*[>}\]]\s*$/.test(text) && /["<]/.test(text)) score++; // JSON, XML/HTML
  if (/^\s*[$#] \S/m.test(text)) score++; // shell input
  return score >= 2;
}

/** “Just now”, “5 min ago”, “3 hours ago”, “yesterday”, “4 days ago” (in the web UI's language) */
export function relativeTime(then: number, now = Date.now()): string {
  const b = t().board;
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return b.justNow;
  const m = Math.round(s / 60);
  if (m < 60) return b.minutesAgo(m);
  const h = Math.round(m / 60);
  if (h < 24) return b.hoursAgo(h);
  const d = Math.round(h / 24);
  return d === 1 ? b.yesterday : b.daysAgo(d);
}

// ---------------------------------------------------------------- Unseen posts

/** newest creation time on a board (service clock): what “seen up to” means for that room; 0 without posts */
export function newestPost(posts: readonly Post[]): number {
  return posts.reduce((n, p) => Math.max(n, p.createdAt), 0);
}

/** posts by others created after `seenAt`: they light up the closed board toggle */
export function unseenPosts(posts: readonly Post[], seenAt: number): Post[] {
  return posts.filter((p) => !p.mine && p.createdAt > seenAt);
}

/** “seen up to” per room as stored in localStorage (`{"<channelId>": <createdAt>}`); anything else counts as empty */
export function parseSeen(raw: string | null): Record<string, number> {
  try {
    const v: unknown = JSON.parse(raw ?? "");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1])));
  } catch {
    return {};
  }
}

/** From how many lines a card is truncated (long texts truncated, full in the popup) */
export const PREVIEW_LINES = 8;

export function isLong(text: string): boolean {
  return text.split(/\r?\n/).length > PREVIEW_LINES || text.length > PREVIEW_LINES * 80;
}

// ---------------------------------------------------------------- Attachments (AP11.3)

/** “812 B”, “34 KB”, “1,2 MB” */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} MB`;
}

export type FileKind = "image" | "pdf" | "text" | "archive" | "audio" | "video" | "other";

/** Rough kind of a file for the icon, by type and extension */
export function fileKind(mime: string, name = ""): FileKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (/zip|tar|gzip|7z|rar|compressed/.test(mime) || ["zip", "tar", "gz", "tgz", "7z", "rar"].includes(ext)) return "archive";
  if (mime.startsWith("text/") || /json|xml|yaml|csv/.test(mime) || ["txt", "md", "csv", "json", "log", "yml", "yaml"].includes(ext)) return "text";
  return "other";
}

/** Name for pasted images without a meaningful file name (the clipboard often delivers “image.png”) */
export function pastedName(file: { name: string; type: string }, now = new Date()): string {
  if (file.name && file.name !== "image.png" && file.name !== "blob") return file.name;
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t().board.pastedPrefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.${ext}`;
}

export interface CopyTarget {
  channelId: number;
  name: string;
}

/**
 * Rooms a post can be copied to, per floor, the own floor first: rooms with a board (not temporary), not the own
 * room, not locked for the user, not on a locked floor. The service checks the same (ADR-0011, "Copy to room").
 */
export type CopyTargets = { floorId: number; floor: string; rooms: CopyTarget[] }[];

export function copyTargets(building: Building | null, channels: readonly Pick<Channel, "id" | "temporary">[]): CopyTargets {
  if (!building) return [];
  const temporary = new Set(channels.filter((c) => c.temporary).map((c) => c.id));
  return [...building.floors]
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf))
    .filter((f) => !f.lock)
    .map((f) => ({ floorId: f.channelId, floor: f.name, rooms: f.rooms.filter((r) => !r.isSelf && !r.locked && !temporary.has(r.channelId)).map((r) => ({ channelId: r.channelId, name: r.name })) }))
    .filter((f) => f.rooms.length > 0);
}

/** posts by the same person this close together share one header (like a chat) */
export const GROUP_MINUTES = 10;

/**
 * Chat-like groups in the displayed order (newest first): `head` = the post shows the author header, `next` = the
 * following post continues its group (the cards join). A post continues the one above it if both are by the same
 * person, at most GROUP_MINUTES apart, and neither is a copy from another room (its header names the origin).
 */
export function postGroups(posts: readonly Pick<Post, "authorName" | "mine" | "createdAt" | "copiedFrom">[]): { head: boolean; next: boolean }[] {
  const continues = (above: (typeof posts)[number] | undefined, post: (typeof posts)[number]) =>
    !!above && above.authorName === post.authorName && above.mine === post.mine && !above.copiedFrom && !post.copiedFrom
    && Math.abs(above.createdAt - post.createdAt) <= GROUP_MINUTES * 60_000;
  return posts.map((post, i) => ({ head: !continues(posts[i - 1], post), next: i + 1 < posts.length && continues(post, posts[i + 1]!) }));
}
