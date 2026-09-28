/** Pinnwand: reine Hilfsfunktionen ohne DOM (ADR-0011, AP11.2). */
import type { Post, PostKind } from "@ruumble/protocol";
import { intlLocale, t } from "../i18n/index.svelte.ts";

export type BoardFilter = "all" | PostKind;

/** Filter der Seitenleiste; die Beschriftung steht in `t().board.filters` */
export const FILTERS: readonly BoardFilter[] = ["all", "text", "code", "image", "file"];

export function filterPosts(posts: readonly Post[], filter: BoardFilter): Post[] {
  return filter === "all" ? [...posts] : posts.filter((p) => p.kind === filter);
}

/**
 * Sieht eingefügter Text nach Quellcode aus? Dann schlägt die Oberfläche „als Code anheften“ vor.
 * Bewusst vorsichtig: mehrzeilig und mehrere typische Merkmale.
 */
export function looksLikeCode(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return false;
  if (/^```/m.test(text)) return false; // schon Markdown mit Codeblock
  // mehrere Zeilen mit Shell-Prompt ($ oder #) sind für sich schon eindeutig
  if (lines.filter((l) => /^\s*[$#] \S/.test(l)).length >= 2) return true;
  let score = 0;
  const indented = lines.filter((l) => /^(\t| {2,})\S/.test(l)).length;
  if (indented >= Math.max(1, lines.length / 4)) score++;
  if (lines.filter((l) => /[;{}]\s*$/.test(l)).length >= 2) score++;
  if (/^\s*(import|from|export|package|using|#include|def|class|function|fn|func|public|private|const|let|var|return|if|for|while)\b/m.test(text)) score++;
  if (/(=>|::|->|===|!==|\+\+|&&|\|\|)/.test(text)) score++;
  if (/^\s*[<{\[][\s\S]*[>}\]]\s*$/.test(text) && /["<]/.test(text)) score++; // JSON, XML/HTML
  if (/^\s*[$#] \S/m.test(text)) score++; // Shell-Eingaben
  return score >= 2;
}

/** „Gerade eben“, „vor 5 Min.“, „vor 3 Std.“, „gestern“, „vor 4 Tagen“ (Sprache der Oberfläche) */
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

/** Ab wie vielen Zeilen eine Karte gekürzt wird (lange Texte gekürzt, voll im Popup) */
export const PREVIEW_LINES = 8;

export function isLong(text: string): boolean {
  return text.split(/\r?\n/).length > PREVIEW_LINES || text.length > PREVIEW_LINES * 80;
}

// ---------------------------------------------------------------- Anhänge (AP11.3)

/** „812 B“, „34 KB“, „1,2 MB“ */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} MB`;
}

export type FileKind = "image" | "pdf" | "text" | "archive" | "audio" | "video" | "other";

/** Grobe Art einer Datei für das Symbol, nach Typ und Endung */
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

/** Name für eingefügte Bilder ohne sinnvollen Dateinamen (Zwischenablage liefert oft „image.png“) */
export function pastedName(file: { name: string; type: string }, now = new Date()): string {
  if (file.name && file.name !== "image.png" && file.name !== "blob") return file.name;
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t().board.pastedPrefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.${ext}`;
}
