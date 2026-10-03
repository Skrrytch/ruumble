/**
 * Board export (room care, ADR-0014): a ZIP with `board.md` (all posts, oldest first) and the attachments under
 * `files/`. Markdown stays as written, code goes into a fenced block; the export is for admins, so it is in English
 * only and needs no localisation. The archive is streamed: files are read while it is sent.
 */
import { createReadStream, existsSync } from "node:fs";
import { Readable } from "node:stream";
import type { BoardStore, StoredPost } from "./store.ts";
import { zipStream, type ZipEntry } from "./zip.ts";

/** "2026-10-03 14:05" in UTC, so the export reads the same everywhere */
const stamp = (t: number) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC";

/** file name for the archive: unique per export, never a path */
export function uniqueName(name: string, taken: Set<string>): string {
  const clean = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "_") || "file";
  let candidate = clean;
  const dot = clean.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ""];
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${base} (${i})${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** longest run of backticks in a text, so a fence around it is one longer */
function fence(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return "`".repeat(longest + 1);
}

/** `files`: attachment ID → name in the archive; an ID without a name is missing on the server */
export function boardMarkdown(roomName: string, posts: StoredPost[], files: Map<string, string>, pinnedId: string | null, now: number): string {
  const lines = [`# Board of "${roomName}"`, "", `Exported ${stamp(now)} · ${posts.length} ${posts.length === 1 ? "post" : "posts"}`, ""];
  for (const p of [...posts].sort((a, b) => a.createdAt - b.createdAt)) {
    const meta = [p.authorName, stamp(p.createdAt), p.kind === "code" ? `code${p.language ? ` (${p.language})` : ""}` : p.kind];
    if (p.id === pinnedId) meta.push("kept on top");
    if (p.copiedFrom) meta.push(`from "${p.copiedFrom.roomName}" by ${p.copiedFrom.authorName}`);
    if (p.updatedByName) meta.push(`last edited by ${p.updatedByName} ${stamp(p.updatedAt)}`);
    lines.push("---", "", `## ${meta.join(" · ")}`, "");
    if (p.attachment && !files.has(p.attachment.id)) {
      lines.push(`*Attachment "${p.attachment.name || "file"}" is missing on the server.*`, "");
    } else if (p.attachment) {
      const file = files.get(p.attachment.id)!;
      // every character that ends a link or its text is escaped (`#`, `?`, brackets in names)
      const link = `files/${encodeURIComponent(file)}`;
      const label = file.replace(/[[\]\\]/g, "\\$&");
      lines.push(p.kind === "image" ? `![${label}](${link})` : `[${label}](${link})`, "");
    }
    if (p.kind === "code") {
      const f = fence(p.text);
      lines.push(`${f}${p.language ?? ""}`, p.text, f, "");
    } else if (p.text.trim()) {
      lines.push(p.text, "");
    }
    if (p.reactions.length) {
      const byKind = new Map<string, string[]>();
      for (const r of p.reactions) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r.authorName]);
      lines.push(`*Reactions: ${[...byKind].map(([k, names]) => `${k} (${names.join(", ")})`).join("; ")}*`, "");
    }
  }
  return lines.join("\n");
}

/** the whole board of a room as a ZIP stream; attachments missing on disk are named in `board.md` instead */
export function exportBoard(store: BoardStore, channelId: number, roomName: string, now = Date.now()): { stream: Readable; posts: number; files: number; missing: number } {
  const posts = store.list(channelId);
  const taken = new Set<string>(["board.md"]);
  const files = new Map<string, string>();
  const entries: ZipEntry[] = [];
  let missing = 0;
  for (const p of posts) {
    if (!p.attachment || files.has(p.attachment.id)) continue;
    const path = store.filePath(p.attachment.id);
    if (!existsSync(path)) {
      missing++;
      continue;
    }
    const name = uniqueName(p.attachment.name || "file", taken);
    files.set(p.attachment.id, name);
    entries.push({ name: `files/${name}`, data: () => createReadStream(path), compress: !p.attachment.mime.startsWith("image/"), date: new Date(p.createdAt) });
  }
  const md = boardMarkdown(roomName, posts, files, store.pinned(channelId)?.postId ?? null, now);
  const stream = Readable.from(zipStream([{ name: "board.md", data: Buffer.from(md, "utf8"), compress: true, date: new Date(now) }, ...entries]));
  return { stream, posts: posts.length, files: entries.length, missing };
}
