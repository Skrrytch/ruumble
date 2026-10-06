/**
 * Nudge (ADR-0020): get the attention of a deafened person in the own room. Mumble plays no sounds while someone is
 * deafened, so the nudge goes as a line to their Mumble log (via their plugin, `notify`) and as an event to their
 * own web UIs, which play a sound from the browser. Nothing is stored; once a minute per pair of people.
 *
 *   POST /api/nudge   { session } → 204
 *
 * Only between people in the same channel, and only while the other one is deafened (by themselves or the server)
 * and has a connected plugin.
 */
import type { FastifyInstance } from "fastify";
import { NUDGE_INTERVAL_MS, NudgeRequest, PROTOCOL_VERSION, type Locale } from "@ruumble/protocol";
import { fail, RateLimiter, type Gate } from "./access.ts";
import type { Hub } from "./hub.ts";

const TEXT: Record<Locale, (name: string) => string> = {
  de: (name) => `${name} hat dich angestupst und möchte etwas von dir.`,
  en: (name) => `${name} nudged you and would like your attention.`,
};

/** the line in the Mumble log of the nudged person, in their language; Mumble prefixes "Ruumble:" */
export function nudgeText(name: string, locale: Locale = "de"): string {
  return TEXT[locale](name.slice(0, 120));
}

export interface NudgeRouteOptions {
  hub: Pick<Hub, "personOf">;
  /** who is asking (access.ts): paired and connected, so the nudged person learns who it is */
  gate: Gate;
  /** how long until the same person may nudge the same person again */
  intervalMs?: number;
}

export async function nudgeRoutes(app: FastifyInstance, o: NudgeRouteOptions): Promise<void> {
  const nudges = new RateLimiter(1, o.intervalMs ?? NUDGE_INTERVAL_MS);

  app.post("/api/nudge", async (req, reply) => {
    const viewer = o.gate.viewer(req);
    if (!viewer) return fail(reply, "not-paired");
    const body = NudgeRequest.safeParse(req.body);
    if (!body.success || body.data.session === viewer.session) return fail(reply, "invalid");
    const person = o.hub.personOf(body.data.session);
    if (!person) return fail(reply, "not-found");
    if (person.channelId !== viewer.channelId) return fail(reply, "not-in-room");
    if (!person.deaf) return fail(reply, "not-deaf");
    if (nudges.over(`${viewer.certHash}>${person.certHash}`)) return fail(reply, "rate-limited");
    person.notify(nudgeText(viewer.name, person.locale));
    person.toUis({ v: PROTOCOL_VERSION, type: "nudge", session: viewer.session, name: viewer.name });
    return reply.code(204).send();
  });
}
