/**
 * Tube mail (Rohrpost, ADR-0021): private messages between two people who use Ruumble, wherever they are in the
 * building. The service only passes them on: to the web UIs of both people and, for texts and invitations, as a line
 * in the recipient's Mumble log. Nothing is stored or logged; the browsers keep a conversation for a day after its
 * last message.
 *
 *   POST /api/tube   TubeSend → TubeMessage
 *
 * Only from a paired person with a connected plugin to someone else whose plugin is connected.
 */
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { PROTOCOL_VERSION, TUBE_LIMITS, TubeSend, type Locale, type TubeMessage } from "@ruumble/protocol";
import { fail, RateLimiter, type Gate } from "./access.ts";
import { personIdOf, type Hub } from "./hub.ts";

/** a Mumble log line holds at most 300 characters (BridgeNotify) */
const NOTIFY_CHARS = 300;

const TEXT: Record<Locale, { text: (name: string) => string; invite: (name: string, room: string) => string }> = {
  de: {
    text: (name) => `Rohrpost von ${name}: `,
    invite: (name, room) => `Rohrpost von ${name}: Komm rüber in den Raum ${room}!`,
  },
  en: {
    text: (name) => `Tube mail from ${name}: `,
    invite: (name, room) => `Tube mail from ${name}: Come over to ${room}!`,
  },
};

/** the line in the recipient's Mumble log, in their language: one line, shortened to fit; Mumble escapes HTML itself */
export function tubeText(message: TubeMessage, locale: Locale = "de"): string | null {
  const name = message.fromName.slice(0, 120);
  const line =
    message.kind === "text" ? TEXT[locale].text(name) + message.text.replace(/\s+/g, " ").trim()
    : message.kind === "invite" ? TEXT[locale].invite(name, message.channelName.slice(0, 120))
    : null;
  if (line === null) return null;
  return line.length <= NOTIFY_CHARS ? line : `${line.slice(0, NOTIFY_CHARS - 1)}…`;
}

export interface TubeRouteOptions {
  hub: Pick<Hub, "personById" | "channelName">;
  /** who is sending (access.ts): paired and connected, so the recipient learns who it is */
  gate: Gate;
  /** messages per person and minute */
  perMinute?: number;
  now?: () => number;
}

export async function tubeRoutes(app: FastifyInstance, o: TubeRouteOptions): Promise<void> {
  const limit = new RateLimiter(o.perMinute ?? TUBE_LIMITS.perMinute, 60_000);
  const now = o.now ?? Date.now;

  app.post("/api/tube", async (req, reply) => {
    const viewer = o.gate.viewer(req);
    if (!viewer) return fail(reply, "not-paired");
    const body = TubeSend.safeParse(req.body);
    const from = personIdOf(viewer.certHash);
    if (!body.success || body.data.to === from) return fail(reply, "invalid");
    const sender = o.hub.personById(from);
    const recipient = o.hub.personById(body.data.to);
    if (!sender) return fail(reply, "not-paired");
    if (!recipient) return fail(reply, "not-found");
    if (limit.over(viewer.certHash)) return fail(reply, "rate-limited");
    const head = { id: randomUUID(), from, to: recipient.personId, fromName: viewer.name, toName: recipient.name, at: now() };
    const send = body.data;
    const message: TubeMessage =
      send.kind === "text" ? { ...head, kind: "text", text: send.text }
      : send.kind === "invite" ? { ...head, kind: "invite", channelId: viewer.channelId, channelName: o.hub.channelName(viewer.channelId) }
      : { ...head, kind: "reaction", target: send.target, reaction: send.reaction, on: send.on };
    const event = { v: PROTOCOL_VERSION, type: "tube", message } as const;
    recipient.toUis(event);
    sender.toUis(event); // the sender's other windows
    const line = tubeText(message, recipient.locale);
    if (line) recipient.notify(line);
    return message;
  });
}
