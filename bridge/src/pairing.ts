/**
 * Pairing web UI ↔ plugin (ADR-0004): one-time link (60 s) → long-lived device token, bound to the
 * certificate hash. Only the SHA-256 of the token is stored.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

interface TokenEntry {
  certHash: string;
  name: string;
  created: string;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export class Pairing {
  private readonly file: string | null;
  private readonly codeTtlMs: number;
  private readonly codes = new Map<string, { certHash: string; name: string; expires: number }>();
  private tokens: Record<string, TokenEntry> = {};

  /** `file = null`: in memory only (tests) */
  constructor(file: string | null, codeTtlMs = 60_000) {
    this.file = file;
    this.codeTtlMs = codeTtlMs;
    if (file) {
      try {
        this.tokens = JSON.parse(readFileSync(file, "utf8")) as Record<string, TokenEntry>;
      } catch {
        this.tokens = {};
      }
    }
  }

  createCode(certHash: string, name: string, now = Date.now()): string {
    for (const [c, v] of this.codes) if (v.expires < now) this.codes.delete(c);
    const code = randomBytes(16).toString("base64url");
    this.codes.set(code, { certHash, name, expires: now + this.codeTtlMs });
    return code;
  }

  /** exchange a one-time code for a device token; `null` if unknown or expired */
  redeem(code: string, now = Date.now()): string | null {
    const entry = this.codes.get(code);
    this.codes.delete(code);
    if (!entry || entry.expires < now) return null;
    const token = randomBytes(32).toString("base64url");
    this.tokens[sha256(token)] = { certHash: entry.certHash, name: entry.name, created: new Date(now).toISOString() };
    this.save();
    return token;
  }

  certHashOf(token: string | undefined): string | null {
    return token ? (this.tokens[sha256(token)]?.certHash ?? null) : null;
  }

  revoke(token: string): void {
    delete this.tokens[sha256(token)];
    this.save();
  }

  private save(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.tokens, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}
