/**
 * Key cabinet (ADR-0015): the paired browsers ("keys"). Everyone sees and may revoke their own; admins (Write on the
 * root channel, as for building care) see and may revoke everyone's.
 *
 *   GET    /api/keys       { mine, others } (others: null for non-admins)
 *   DELETE /api/keys/:id   revoke a key; web UIs using it become unpaired, revoking the own browser's key logs it out
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import type { KeyCabinet } from "@ruumble/protocol";
import type { Hub } from "./hub.ts";
import type { MumbleSource } from "./mumble.ts";
import type { Pairing } from "./pairing.ts";

export interface KeyRouteOptions {
  pairing: Pairing;
  hub: Hub;
  source: Pick<MumbleSource, "canWrite">;
  /** device token from the cookie header */
  tokenOf: (cookieHeader: string | undefined) => string | undefined;
  /** remove the token cookie (the browser revoked its own key) */
  clearCookie: (reply: FastifyReply) => void;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export async function keyRoutes(app: FastifyInstance, o: KeyRouteOptions): Promise<void> {
  /** the asking person and whether they administer the building */
  async function holder(cookie: string | undefined): Promise<{ certHash: string; keyId: string | null; admin: boolean } | null> {
    const token = o.tokenOf(cookie);
    const certHash = o.pairing.certHashOf(token);
    if (!certHash) return null;
    const viewer = o.hub.whoIs(certHash);
    const admin = !!viewer && (await o.source.canWrite(viewer.session, 0));
    return { certHash, keyId: o.pairing.keyIdOf(token), admin };
  }

  app.get("/api/keys", async (req, reply) => {
    const h = await holder(req.headers.cookie);
    if (!h) return reply.code(401).send({ error: "not-paired" });
    const all = o.pairing.keys(h.keyId);
    const view: KeyCabinet = {
      mine: all.find((x) => x.certHash === h.certHash)?.keys ?? [],
      others: h.admin ? all.filter((x) => x.certHash !== h.certHash).map(({ name, keys }) => ({ name, keys })).sort((a, b) => a.name.localeCompare(b.name, "de")) : null,
    };
    return view;
  });

  app.delete<{ Params: { id: string } }>("/api/keys/:id", async (req, reply) => {
    const h = await holder(req.headers.cookie);
    if (!h) return reply.code(401).send({ error: "not-paired" });
    const id = req.params.id;
    const owner = o.pairing.keys().find((x) => x.keys.some((k) => k.id === id));
    if (!owner) return reply.code(404).send({ error: "not-found" });
    if (owner.certHash !== h.certHash && !h.admin) return reply.code(403).send({ error: "forbidden" });
    o.pairing.revokeKey(id);
    o.log?.("Key revoked", { key: id, own: owner.certHash === h.certHash, holder: owner.name });
    o.hub.keyRevoked(id);
    if (id === h.keyId) o.clearCookie(reply);
    return reply.code(204).send();
  });
}
