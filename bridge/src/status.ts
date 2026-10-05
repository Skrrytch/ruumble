/**
 * Status (B, ADR-0018): a short free text a person sets in Ruumble, e.g. "In a meeting until 2 pm". Kept by the service
 * by certificate hash in `statuses.json`, expires after the chosen time (default 2 hours) or never, and is shown to
 * everyone at the person's avatar while their plugin is connected. The last texts used are kept for quick choice.
 * The Mumble comment cannot be used: the plugin API changes it only locally (docs/features.md, B).
 *
 *   GET    /api/status   { current, recent } of the asking person
 *   PUT    /api/status   { text, minutes } (minutes null: no expiry) → the same as GET
 *   DELETE /api/status   clear the own status → the same as GET
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { FastifyInstance } from "fastify";
import { STATUS_LIMITS, StatusRequest, type StatusView, type UserStatus } from "@ruumble/protocol";
import { fail, RateLimiter, type Gate } from "./access.ts";

interface Entry {
  current: UserStatus | null;
  /** newest first, without duplicates */
  recent: string[];
}

export interface StatusBookOptions {
  now?: () => number;
  /** a status was set, cleared or expired: snapshots go out again */
  onChange?: () => void;
}

/** one line, single spaces: a status is shown in a tooltip and must not carry line breaks or control characters */
export function normalizeStatus(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim();
}

export class StatusBook {
  private entries: Record<string, Entry> = {};
  private readonly file: string | null;
  private readonly now: () => number;
  private readonly onChange: () => void;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** `file` null: in memory only (tests) */
  constructor(file: string | null, o: StatusBookOptions = {}) {
    this.file = file;
    this.now = o.now ?? Date.now;
    this.onChange = o.onChange ?? (() => {});
    if (file) {
      try {
        this.entries = JSON.parse(readFileSync(file, "utf8")) as Record<string, Entry>;
      } catch {
        this.entries = {};
      }
    }
    this.expire();
  }

  /** the person's current status, null if none or expired */
  current(certHash: string): UserStatus | null {
    const c = this.entries[certHash]?.current ?? null;
    return c && (c.until === null || c.until > this.now()) ? c : null;
  }

  view(certHash: string): StatusView {
    return { current: this.current(certHash), recent: this.entries[certHash]?.recent ?? [] };
  }

  /** set the status; `minutes` null: no expiry. The text goes to the front of the recent ones. */
  set(certHash: string, text: string, minutes: number | null): StatusView {
    const clean = normalizeStatus(text).slice(0, STATUS_LIMITS.textChars);
    const recent = [clean, ...(this.entries[certHash]?.recent ?? []).filter((r) => r !== clean)].slice(0, STATUS_LIMITS.recent);
    this.entries[certHash] = { current: { text: clean, until: minutes === null ? null : this.now() + minutes * 60_000 }, recent };
    this.changed();
    return this.view(certHash);
  }

  /** clear the status; the recent texts stay */
  clear(certHash: string): StatusView {
    const e = this.entries[certHash];
    if (e?.current) {
      e.current = null;
      this.changed();
    }
    return this.view(certHash);
  }

  /** remove expired statuses (also run by the timer); true if one was removed */
  expire(): boolean {
    const now = this.now();
    let removed = false;
    for (const e of Object.values(this.entries)) {
      if (e.current && e.current.until !== null && e.current.until <= now) {
        e.current = null;
        removed = true;
      }
    }
    if (removed) this.save();
    this.schedule();
    return removed;
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private changed(): void {
    this.save();
    this.schedule();
    this.onChange();
  }

  /** wake up when the next status expires */
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const next = Math.min(...Object.values(this.entries).map((e) => e.current?.until ?? Infinity));
    if (next === Infinity) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.expire()) this.onChange();
    }, Math.max(0, next - this.now()) + 50);
    this.timer.unref?.();
  }

  private save(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.entries, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}

export interface StatusRouteOptions {
  book: StatusBook;
  /** who is asking (access.ts): paired is enough, Mumble need not be connected */
  gate: Gate;
  /** changes per person and minute */
  writesPerMinute?: number;
}

export async function statusRoutes(app: FastifyInstance, o: StatusRouteOptions): Promise<void> {
  const writes = new RateLimiter(o.writesPerMinute ?? 20);

  app.get("/api/status", async (req, reply) => {
    const certHash = o.gate.certHash(req);
    if (!certHash) return fail(reply, "not-paired");
    return o.book.view(certHash);
  });

  app.put("/api/status", async (req, reply) => {
    const certHash = o.gate.certHash(req);
    if (!certHash) return fail(reply, "not-paired");
    const body = StatusRequest.safeParse(req.body);
    if (!body.success || !normalizeStatus(body.data.text)) return fail(reply, "invalid");
    if (writes.over(certHash)) return fail(reply, "rate-limited");
    return o.book.set(certHash, body.data.text, body.data.minutes);
  });

  app.delete("/api/status", async (req, reply) => {
    const certHash = o.gate.certHash(req);
    if (!certHash) return fail(reply, "not-paired");
    if (writes.over(certHash)) return fail(reply, "rate-limited");
    return o.book.clear(certHash);
  });
}
