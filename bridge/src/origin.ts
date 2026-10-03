/**
 * Origin check (ADR-0017): which page may talk to the service with the user's cookie, and who may act as a plugin.
 *
 * - A browser always sends `Origin` with WebSocket handshakes and with POST/PUT/DELETE. Requests to `/ws/ui` and
 *   every changing request must come from the service's own address (the request's host or PUBLIC_URL), so another
 *   page in the same browser cannot use the cookie (CSRF, cross-site WebSocket).
 * - The plugin (IXWebSocket) sends `Origin: ws(s)://<service>`, a browser `http(s)://<page>`. A browser origin at
 *   `/ws/plugin` is turned away: otherwise any web page could pose as the plugin from the victim's own address.
 * - Without `Origin` (curl, older tools) the request passes: it carries no browser cookie by accident.
 */

import type { FastifyReply, FastifyRequest } from "fastify";

export type OriginVerdict = "ok" | "foreign-origin" | "browser-as-plugin";

export interface OriginRequest {
  method: string;
  /** path without the query */
  path: string;
  origin: string | undefined;
  /** the host the request was sent to (Host or X-Forwarded-Host behind a trusted proxy), with port */
  host: string;
  /** PUBLIC_URL, if set */
  publicUrl?: string;
}

const READ_ONLY = new Set(["GET", "HEAD", "OPTIONS"]);

export function checkOrigin(r: OriginRequest): OriginVerdict {
  if (r.origin === undefined) return "ok";
  const origin = parse(r.origin);
  if (r.path === "/ws/plugin") return origin && (origin.protocol === "http:" || origin.protocol === "https:") ? "browser-as-plugin" : "ok";
  if (READ_ONLY.has(r.method) && r.path !== "/ws/ui") return "ok";
  if (!origin) return "foreign-origin"; // "null" (sandboxed frames, file:) or garbage
  const allowed = new Set([hostOf(r.host)]);
  const pub = r.publicUrl ? parse(r.publicUrl) : null;
  if (pub) allowed.add(hostOf(pub.host));
  return allowed.has(hostOf(origin.host)) ? "ok" : "foreign-origin";
}

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** host with port, default ports removed and lower case: "Ruumble.example:443" and "ruumble.example" are the same */
function hostOf(host: string): string {
  return host.toLowerCase().replace(/:(80|443)$/, "");
}

/** Fastify `onRequest` hook: turns away what `checkOrigin` refuses with 403, before any route or WebSocket upgrade */
export function originGuard(publicUrl: string | undefined, warn?: (msg: string, extra: Record<string, unknown>) => void) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split("?")[0]!;
    const origin = req.headers.origin;
    if (checkOrigin({ method: req.method, path, origin, host: req.host, publicUrl }) === "ok") return;
    warn?.("Request from a foreign origin turned away", { path, origin, host: req.host });
    return reply.code(403).send({ error: "forbidden" });
  };
}
