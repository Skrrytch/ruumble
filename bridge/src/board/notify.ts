/**
 * Hinweis im Mumble-Protokoll beim Anheften (AP11.4): kurz und mit dem Typ des Beitrags.
 * Mumble setzt „Ruumble:“ davor und maskiert HTML selbst, der Text bleibt deshalb reiner Text.
 */
import { PROTOCOL_VERSION, type PostKind } from "@ruumble/protocol";
import type { Hub } from "../hub.ts";

const WHAT: Record<PostKind, string> = { text: "einen Text", code: "Code", image: "ein Bild", file: "eine Datei" };

export function notifyText(authorName: string, kind: PostKind): string {
  return `${authorName.slice(0, 120)} hat ${WHAT[kind]} an die Pinnwand geheftet.`;
}

/** An die Plugins der übrigen Anwesenden im Raum schicken (ohne den Autor) */
export function notifyRoom(
  hub: Pick<Hub, "pluginsIn">,
  post: { channelId: number; kind: PostKind },
  author: { name: string; certHash: string },
): number {
  const targets = hub.pluginsIn(post.channelId, author.certHash);
  const text = notifyText(author.name, post.kind);
  for (const plugin of targets) plugin.send({ v: PROTOCOL_VERSION, type: "notify", text });
  return targets.length;
}
