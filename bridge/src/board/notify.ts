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

const CLEARED: Record<Locale, (name: string) => string> = {
  de: (name) => `${name} hat die Pinnwand geleert.`,
  en: (name) => `${name} cleared the board.`,
};

export function clearedText(name: string, locale: Locale = "de"): string {
  return CLEARED[locale](name.slice(0, 120));
}

/** care (ADR-0014): the board of a room was cleared; to the people present, except whoever did it */
export function notifyCleared(hub: Pick<Hub, "pluginsIn">, channelId: number, by: { name: string; certHash: string }): number {
  const targets = hub.pluginsIn(channelId, by.certHash);
  for (const plugin of targets) plugin.send({ v: PROTOCOL_VERSION, type: "notify", text: clearedText(by.name, plugin.locale) });
  return targets.length;
}
