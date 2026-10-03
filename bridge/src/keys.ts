/**
 * Key cabinet (ADR-0015): the paired browsers ("keys"). Everyone sees and may revoke their own; admins (Write on the
 * root channel, as for building care) see and may revoke everyone's.
 *
 *   GET    /api/keys       { mine, others } (others: null for non-admins)
 *   DELETE /api/keys/:id   revoke a key; web UIs using it become unpaired, revoking the own browser's key logs it out
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { KeyCabinet } from "@ruumble/protocol";
import { fail, type Gate } from "./access.ts";
import type { Hub } from "./hub.ts";
import type { Pairing } from "./pairing.ts";

export interface KeyRouteOptions {
  pairing: Pairing;
  hub: Hub;
  /** who is asking and their Write permission (access.ts) */
  gate: Gate;
  /** device token from the cookie header */
  tokenOf: (cookieHeader: string | undefined) => string | undefined;
  /** remove the token cookie (the browser revoked its own key) */
  clearCookie: (reply: FastifyReply) => void;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export async function keyRoutes(app: FastifyInstance, o: KeyRouteOptions): Promise<void> {
  /** the asking person (paired, Mumble not needed for the own keys) and whether they administer the building */
  async function holder(req: FastifyRequest): Promise<{ certHash: string; keyId: string | null; admin: boolean } | null> {
    const certHash = o.gate.certHash(req);
    if (!certHash) return null;
    const viewer = o.gate.viewer(req);
    const admin = !!viewer && (await o.gate.mayWrite(viewer, 0));
    return { certHash, keyId: o.pairing.keyIdOf(o.tokenOf(req.headers.cookie)), admin };
  }

  app.get("/api/keys", async (req, reply) => {
    const h = await holder(req);
    if (!h) return fail(reply, "not-paired");
    const all = o.pairing.keys(h.keyId);
    const view: KeyCabinet = {
      mine: all.find((x) => x.certHash === h.certHash)?.keys ?? [],
      others: h.admin ? all.filter((x) => x.certHash !== h.certHash).map(({ name, keys }) => ({ name, keys })).sort((a, b) => a.name.localeCompare(b.name, "de")) : null,
    };
    return view;
  });

  app.delete<{ Params: { id: string } }>("/api/keys/:id", async (req, reply) => {
    const h = await holder(req);
    if (!h) return fail(reply, "not-paired");
    const id = req.params.id;
    const owner = o.pairing.keys().find((x) => x.keys.some((k) => k.id === id));
    if (!owner) return fail(reply, "not-found");
    if (owner.certHash !== h.certHash && !h.admin) return fail(reply, "forbidden");
    o.pairing.revokeKey(id);
    o.log?.("Key revoked", { key: id, own: owner.certHash === h.certHash, holder: owner.name });
    o.hub.keyRevoked(id);
    if (id === h.keyId) o.clearCookie(reply);
    return reply.code(204).send();
  });
}
