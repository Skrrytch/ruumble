/**
 * Pairing web UI ↔ plugin (ADR-0004): one-time link (60 s) → long-lived device token, bound to the
 * certificate hash. Only the SHA-256 of the token is stored.
 * Further browsers: 6-digit code in the Mumble log, entered on the page (ADR-0012).
 * Key cabinet (ADR-0015): every token ("key") also has a coarse device label and when it was last used.
 * New keys are announced in the Mumble log of their owner, once per plugin address (ADR-0017).
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DeviceKey, Locale } from "@ruumble/protocol";

interface TokenEntry {
  certHash: string;
  name: string;
  created: string;
  /** "Firefox on Linux", from the User-Agent at pairing or first use (ADR-0015) */
  device?: string;
  lastUsed?: string;
  /** addresses of plugin connections that were told about this key (ADR-0017); missing: from before, never told */
  noticed?: string[];
}

/** a new key is announced to plugin connections from further addresses for this long */
export const KEY_NOTICE_DAYS = 30;
/** at most this many addresses are remembered per key */
const NOTICED_MAX = 5;

/** "last used" is written at most this often per key, so connecting does not rewrite the file every time */
const TOUCH_INTERVAL_MS = 60 * 60_000;

/** coarse, privacy-friendly description of a browser: browser family and operating system, no versions */
export function deviceLabel(userAgent: string | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "";
  return browser && os ? `${browser} on ${os}` : browser || os;
}

/** the public name of a key: the start of its stored hash (the token itself cannot be derived from it) */
const keyId = (hash: string) => hash.slice(0, 16);

/** a request for codes (ADR-0012): one code per matching plugin */
interface CodeRequest {
  codes: Map<string, { certHash: string; name: string }>;
  expires: number;
  attempts: number;
}

export const CODE_REQUEST_TTL_MS = 5 * 60_000;
export const CODE_ATTEMPTS = 5;
export const CODE_REQUEST_INTERVAL_MS = 10_000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** notice in the Mumble log; Mumble prefixes "Ruumble:" */
const CODE_TEXT: Record<Locale, (code: string) => string> = {
  de: (code) => `Kopplungscode für einen Browser: ${code} (5 Minuten gültig). Ignoriere ihn, wenn du ihn nicht angefordert hast.`,
  en: (code) => `Pairing code for a browser: ${code} (valid for 5 minutes). Ignore it if you did not request it.`,
};

/** notice in the Mumble log about a new key; `device` as stored ("Firefox on Linux") */
const KEY_TEXT: Record<Locale, (device: string, date: string | null) => string> = {
  de: (device, date) =>
    `${date ? `Am ${date} wurde` : "Gerade wurde"} ein Browser mit deinem Mumble-Zertifikat gekoppelt (${device.replace(" on ", " unter ") || "unbekannter Browser"}). Warst du das nicht, ziehe den Schlüssel in Ruumble unter „Meine Schlüssel“ zurück.`,
  en: (device, date) =>
    `${date ? `On ${date}, a` : "A"} browser was paired with your Mumble certificate (${device || "unknown browser"}). If that was not you, revoke the key in Ruumble under "My keys".`,
};

/** a key paired less than this long ago is "just now" in the notice */
const JUST_NOW_MS = 10 * 60_000;

export function newKeyText(device: string, created: number, now: number, locale: Locale = "de"): string {
  const date = now - created < JUST_NOW_MS ? null : new Date(created).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  return KEY_TEXT[locale](device, date);
}

/** "482913" → "482 913" (easier to read in the log; the page accepts both) */
export function pairingCodeText(code: string, locale: Locale = "de"): string {
  return CODE_TEXT[locale](`${code.slice(0, 3)} ${code.slice(3)}`);
}

export class Pairing {
  private readonly file: string | null;
  private readonly codeTtlMs: number;
  private readonly codes = new Map<string, { certHash: string; name: string; expires: number }>();
  private readonly requests = new Map<string, CodeRequest>();
  /** address → time of the last request with codes (rate limit) */
  private readonly lastRequest = new Map<string, number>();
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
  redeem(code: string, now = Date.now(), userAgent?: string): string | null {
    const entry = this.codes.get(code);
    this.codes.delete(code);
    if (!entry || entry.expires < now) return null;
    return this.issue(entry.certHash, entry.name, now, userAgent);
  }

  /**
   * New request from a browser at `address`: one 6-digit code per target (ADR-0012).
   * The caller delivers the codes to the plugins; the browser only gets the request ID.
   */
  requestCodes(
    address: string,
    targets: { certHash: string; name: string }[],
    now = Date.now(),
  ): { request: string; codes: { certHash: string; code: string }[] } | "no-plugin" | "rate-limited" {
    for (const [id, r] of this.requests) if (r.expires < now) this.requests.delete(id);
    for (const [a, t] of this.lastRequest) if (now - t >= CODE_REQUEST_INTERVAL_MS) this.lastRequest.delete(a);
    if (targets.length === 0) return "no-plugin";
    if (this.lastRequest.has(address)) return "rate-limited";
    this.lastRequest.set(address, now);
    const codes = new Map<string, { certHash: string; name: string }>();
    for (const t of targets) {
      let code: string;
      do code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      while (codes.has(code));
      codes.set(code, t);
    }
    const request = randomBytes(16).toString("base64url");
    this.requests.set(request, { codes, expires: now + CODE_REQUEST_TTL_MS, attempts: 0 });
    return { request, codes: [...codes].map(([code, t]) => ({ certHash: t.certHash, code })) };
  }

  /** code entered on the page → device token; after 5 wrong attempts the request is void */
  confirmCode(request: string, code: string, now = Date.now(), userAgent?: string): string | "wrong-code" | "expired" {
    const r = this.requests.get(request);
    if (!r || r.expires < now) {
      this.requests.delete(request);
      return "expired";
    }
    const target = r.codes.get(code);
    if (!target) {
      r.attempts++;
      if (r.attempts < CODE_ATTEMPTS) return "wrong-code";
      this.requests.delete(request);
      return "expired";
    }
    this.requests.delete(request);
    return this.issue(target.certHash, target.name, now, userAgent);
  }

  private issue(certHash: string, name: string, now: number, userAgent?: string): string {
    const token = randomBytes(32).toString("base64url");
    const at = new Date(now).toISOString();
    this.tokens[sha256(token)] = { certHash, name, created: at, device: deviceLabel(userAgent), lastUsed: at, noticed: [] };
    this.save();
    return token;
  }

  /** a web UI connected with this token: note when, and the device if not known yet (keys from before ADR-0015) */
  touch(token: string | undefined, userAgent: string | undefined, now = Date.now()): void {
    const entry = token ? this.tokens[sha256(token)] : undefined;
    if (!entry) return;
    const device = entry.device || deviceLabel(userAgent);
    const stale = !entry.lastUsed || now - Date.parse(entry.lastUsed) >= TOUCH_INTERVAL_MS;
    if (!stale && device === entry.device) return;
    entry.device = device;
    if (stale) entry.lastUsed = new Date(now).toISOString();
    this.save();
  }

  /**
   * Keys of `certHash` from the last 30 days that a plugin connection from `address` has not been told about yet;
   * they count as told from now on (ADR-0017). A forger who received the first notice cannot hide the key from the
   * real user's plugin at another address.
   */
  takeUnnoticedKeys(certHash: string, address: string, now = Date.now()): { device: string; created: number }[] {
    const found: { device: string; created: number }[] = [];
    for (const e of Object.values(this.tokens)) {
      const created = Date.parse(e.created);
      if (e.certHash !== certHash || !e.noticed || e.noticed.includes(address) || now - created > KEY_NOTICE_DAYS * 86_400_000) continue;
      e.noticed = [...e.noticed, address].slice(-NOTICED_MAX);
      found.push({ device: e.device ?? "", created });
    }
    if (found.length) this.save();
    return found.sort((a, b) => a.created - b.created);
  }

  /** public name of the key behind a token, null if unknown */
  keyIdOf(token: string | undefined): string | null {
    if (!token) return null;
    const hash = sha256(token);
    return this.tokens[hash] ? keyId(hash) : null;
  }

  /** every key, grouped by person (certificate hash), newest first; `current`: the key of the asking browser */
  keys(current: string | null = null): { certHash: string; name: string; keys: DeviceKey[] }[] {
    const holders = new Map<string, { certHash: string; name: string; keys: DeviceKey[]; latest: string }>();
    for (const [hash, e] of Object.entries(this.tokens)) {
      const h = holders.get(e.certHash) ?? { certHash: e.certHash, name: e.name, keys: [], latest: "" };
      if (e.created > h.latest) Object.assign(h, { name: e.name, latest: e.created }); // the name at the latest pairing
      const id = keyId(hash);
      h.keys.push({ id, device: e.device ?? "", created: Date.parse(e.created), lastUsed: e.lastUsed ? Date.parse(e.lastUsed) : null, current: id === current });
      holders.set(e.certHash, h);
    }
    return [...holders.values()].map(({ latest: _latest, ...h }) => ({ ...h, keys: h.keys.sort((a, b) => b.created - a.created) }));
  }

  /** revoke a key by its public name; returns the certificate hash it belonged to, null if unknown */
  revokeKey(id: string): string | null {
    const hash = Object.keys(this.tokens).find((h) => keyId(h) === id);
    if (!hash) return null;
    const { certHash } = this.tokens[hash]!;
    delete this.tokens[hash];
    this.save();
    return certHash;
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
