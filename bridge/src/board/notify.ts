/**
 * Notice in the Mumble log when pinning (AP11.4): short and with the type of the post,
 * in the language of each recipient (reported by the plugin, otherwise German). A copy from another room names that room.
 * Mumble prefixes "Ruumble:" and escapes HTML itself, so the text stays plain text.
 */
import { PROTOCOL_VERSION, type Locale, type PostKind } from "@ruumble/protocol";
import type { Hub } from "../hub.ts";

const TEXT: Record<Locale, (name: string, kind: PostKind, from?: string) => string> = {
  de: (name, kind, from) => `${name} hat ${{ text: "einen Text", code: "Code", image: "ein Bild", file: "eine Datei" }[kind]}${from === undefined ? "" : ` aus „${from}“`} an die Pinnwand geheftet.`,
  en: (name, kind, from) => `${name} ${from === undefined ? "pinned" : "brought"} ${{ text: "a text", code: "code", image: "an image", file: "a file" }[kind]}${from === undefined ? "" : ` from "${from}"`} to the board.`,
};

/** `from`: name of the room a copy came from */
export function notifyText(authorName: string, kind: PostKind, locale: Locale = "de", from?: string): string {
  return TEXT[locale](authorName.slice(0, 120), kind, from?.slice(0, 80));
}

/** Send to the plugins of the other people present in the room (excluding the author) */
export function notifyRoom(
  hub: Pick<Hub, "pluginsIn">,
  post: { channelId: number; kind: PostKind; copiedFrom?: { roomName: string } },
  author: { name: string; certHash: string },
): number {
  const targets = hub.pluginsIn(post.channelId, author.certHash);
  for (const plugin of targets) plugin.send({ v: PROTOCOL_VERSION, type: "notify", text: notifyText(author.name, post.kind, plugin.locale, post.copiedFrom?.roomName) });
  return targets.length;
}

/** what care did to a board (ADR-0014) */
export type CareChange = { kind: "cleared" } | { kind: "pruned"; days: number } | { kind: "moved"; posts: number; from: string };

const CARE: Record<Locale, (name: string, change: CareChange) => string> = {
  de: (name, c) =>
    c.kind === "cleared" ? `${name} hat die Pinnwand geleert.`
    : c.kind === "pruned" ? `${name} hat Beiträge, die älter als ${c.days} Tage sind, von der Pinnwand entfernt.`
    : `${name} hat ${c.posts === 1 ? "einen Beitrag" : `${c.posts} Beiträge`} aus „${c.from}“ an diese Pinnwand gebracht.`,
  en: (name, c) =>
    c.kind === "cleared" ? `${name} cleared the board.`
    : c.kind === "pruned" ? `${name} removed posts older than ${c.days} days from the board.`
    : `${name} moved ${c.posts === 1 ? "a post" : `${c.posts} posts`} from "${c.from}" to this board.`,
};

export function careText(name: string, change: CareChange, locale: Locale = "de"): string {
  return CARE[locale](name.slice(0, 120), change.kind === "moved" ? { ...change, from: change.from.slice(0, 80) } : change);
}

/** care (ADR-0014) changed the board of a room; to the people present, except whoever did it */
export function notifyCare(hub: Pick<Hub, "pluginsIn">, channelId: number, by: { name: string; certHash: string }, change: CareChange): number {
  const targets = hub.pluginsIn(channelId, by.certHash);
  for (const plugin of targets) plugin.send({ v: PROTOCOL_VERSION, type: "notify", text: careText(by.name, change, plugin.locale) });
  return targets.length;
}
