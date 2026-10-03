import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { API_ERROR_STATUS } from "@ruumble/protocol";
import { Gate, RateLimiter } from "../src/access.ts";

describe("access", () => {
  it("rate limiter: a sliding window per key, a refused hit does not count, idle keys are forgotten", () => {
    const limit = new RateLimiter(2, 1000);
    expect([limit.over("a", 0), limit.over("a", 100), limit.over("a", 200)]).toEqual([false, false, true]);
    expect(limit.over("b", 200)).toBe(false); // per key
    expect(limit.over("a", 1000)).toBe(false); // the hit at 0 left the window
    expect(limit.over("a", 1050)).toBe(true);
    expect(limit.over("c", 5000)).toBe(false);
    expect(limit.size).toBe(1); // a and b had no hit in the last second
  });

  it("gate: not paired, paired without Mumble, Write per channel", async () => {
    const viewer = { certHash: "a", session: 7, name: "Anna", channelId: 2 };
    const gate = new Gate({
      hub: { whoIs: (hash) => (hash === "a" ? viewer : null) },
      source: { canWrite: async (session, channel) => session === 7 && channel === 1 },
      certHashOf: (cookie) => (cookie === "anna" ? "a" : cookie === "offline" ? "o" : null),
    });
    const req = (cookie?: string) => ({ headers: cookie ? { cookie } : {} }) as FastifyRequest;
    expect(gate.certHash(req("offline"))).toBe("o");
    expect(gate.viewer(req("offline"))).toBeNull();
    expect(await gate.writer(req(), 1)).toBe("not-paired");
    expect(await gate.writer(req("anna"), 0)).toBe("forbidden");
    expect(await gate.writer(req("anna"), 1)).toBe(viewer);
  });

  it("one status per error code", () => {
    expect(API_ERROR_STATUS).toMatchObject({ "not-paired": 401, forbidden: 403, "not-found": 404, "too-large": 413, "rate-limited": 429 });
  });
});
