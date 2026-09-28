/**
 * Hinweis im Mumble-Protokoll beim Anheften (AP11.4): kurz und mit dem Typ des Beitrags,
 * in der Sprache des jeweiligen Empfängers (vom Plugin gemeldet, sonst Deutsch).
 * Mumble setzt „Ruumble:“ davor und maskiert HTML selbst, der Text bleibt deshalb reiner Text.
 */
import { PROTOCOL_VERSION, type Locale, type PostKind } from "@ruumble/protocol";
import type { Hub } from "../hub.ts";

const TEXT: Record<Locale, (name: string, kind: PostKind) => string> = {
  de: (name, kind) => `${name} hat ${{ text: "einen Text", code: "Code", image: "ein Bild", file: "eine Datei" }[kind]} an die Pinnwand geheftet.`,
  en: (name, kind) => `${name} pinned ${{ text: "a text", code: "code", image: "an image", file: "a file" }[kind]} to the board.`,
};

export function notifyText(authorName: string, kind: PostKind, locale: Locale = "de"): string {
  return TEXT[locale](authorName.slice(0, 120), kind);
}

/** An die Plugins der übrigen Anwesenden im Raum schicken (ohne den Autor) */
export function notifyRoom(
  hub: Pick<Hub, "pluginsIn">,
  post: { channelId: number; kind: PostKind },
  author: { name: string; certHash: string },
): number {
  const targets = hub.pluginsIn(post.channelId, author.certHash);
  for (const plugin of targets) plugin.send({ v: PROTOCOL_VERSION, type: "notify", text: notifyText(author.name, post.kind, plugin.locale) });
  return targets.length;
}
