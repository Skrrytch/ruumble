/** Pinnwand: reine Hilfsfunktionen ohne DOM (ADR-0011, AP11.2). */
import type { Post, PostKind } from "@ruumble/protocol";

export type BoardFilter = "all" | PostKind;

export const FILTERS: { id: BoardFilter; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "text", label: "Text" },
  { id: "code", label: "Code" },
  { id: "image", label: "Bilder" },
  { id: "file", label: "Dateien" },
];

export const KIND_LABEL: Record<PostKind, string> = { text: "Text", code: "Code", image: "Bild", file: "Datei" };

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

/** „Gerade eben“, „vor 5 Min.“, „vor 3 Std.“, „gestern“, „vor 4 Tagen“ */
export function relativeTime(then: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return "Gerade eben";
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? "gestern" : `vor ${d} Tagen`;
}

export function countLabel(n: number): string {
  return n === 0 ? "Noch keine Beiträge" : n === 1 ? "1 Beitrag" : `${n} Beiträge`;
}

/** Ab wie vielen Zeilen eine Karte gekürzt wird (Entwurf/ideen.md: lange Texte gekürzt, voll im Popup) */
export const PREVIEW_LINES = 8;

export function isLong(text: string): boolean {
  return text.split(/\r?\n/).length > PREVIEW_LINES || text.length > PREVIEW_LINES * 80;
}
