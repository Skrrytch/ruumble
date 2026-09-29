/** Board: pure helper functions without DOM (ADR-0011, AP11.2). */
import { REACTION_KINDS, type Post, type PostKind, type Reaction, type ReactionKind } from "@ruumble/protocol";
import { intlLocale, t } from "../i18n/index.svelte.ts";

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
