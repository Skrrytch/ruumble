/**
 * Who may call the REST API, how often, and what a refusal looks like: one mechanism for the board (ADR-0011), care
 * (ADR-0014), keys (ADR-0015) and maintenance (ADR-0016), so a new route module cannot get it wrong.
 *
 * - `Gate`: the device token → the paired person → their connected Mumble session; Write permission on a channel
 *   (Mumble's ACL via Ice, asked anew for every request, never taken from the snapshot).
 * - `RateLimiter`: sliding window per key (person or address); forgets keys without recent hits.
 * - `fail`: `{ error }` with the status from `API_ERROR_STATUS` (protocol).
 */
import type { FastifyReply, FastifyRequest } from "fastify";
import { API_ERROR_STATUS, type BoardErrorCode } from "@ruumble/protocol";
import type { Hub, Viewer } from "./hub.ts";
import type { MumbleSource } from "./mumble.ts";

export type ApiErrorCode = BoardErrorCode;

export const fail = (reply: FastifyReply, error: ApiErrorCode) => reply.code(API_ERROR_STATUS[error]).send({ error });

export interface GateOptions {
  hub: Pick<Hub, "whoIs">;
  source: Pick<MumbleSource, "canWrite">;
  /** device token from the cookie header → certificate hash of the paired person */
  certHashOf: (cookieHeader: string | undefined) => string | null;
}

export class Gate {
  private readonly o: GateOptions;

  constructor(o: GateOptions) {
    this.o = o;
  }

  /** the paired person behind the request, also while their Mumble client is not connected */
  certHash(req: FastifyRequest): string | null {
    return this.o.certHashOf(req.headers.cookie);
  }

  /** paired and connected: who, which session, where; otherwise null (not-paired) */
  viewer(req: FastifyRequest): Viewer | null {
    return this.o.hub.whoIs(this.certHash(req));
  }

  /** Write permission of this viewer on the channel (0: the root channel, i.e. the building) */
  mayWrite(viewer: Viewer, channelId: number): Promise<boolean> {
    return this.o.source.canWrite(viewer.session, channelId);
  }

  /** paired, connected and Write on the channel: the viewer, or why not */
  async writer(req: FastifyRequest, channelId: number): Promise<Viewer | "not-paired" | "forbidden"> {
    const viewer = this.viewer(req);
    if (!viewer) return "not-paired";
    return (await this.mayWrite(viewer, channelId)) ? viewer : "forbidden";
  }
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private sweep = 0;

  constructor(limit: number, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** count a hit for `key`; true if it is one too many (then it is not counted) */
  over(key: string, now = Date.now()): boolean {
    if (now - this.sweep >= this.windowMs) {
      for (const [k, list] of this.hits) if (!list.some((t) => now - t < this.windowMs)) this.hits.delete(k);
      this.sweep = now;
    }
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return true;
    }
    list.push(now);
    this.hits.set(key, list);
    return false;
  }

  /** keys with hits in the window (tests, diagnostics) */
  get size(): number {
    return this.hits.size;
  }
}
