/**
 * Tube mail (Rohrpost, ADR-0022): a file handed from one person to others who are there at the same time. The
 * service passes it through and stores nothing: the file stays in the sender's tab, which uploads it piece by piece
 * for every recipient who accepts; each piece goes straight into that recipient's download and is confirmed only once
 * it went out. Neither file names, notes nor contents are logged.
 *
 *   POST   /api/parcels                          ParcelOffer → Parcel (the sender's view)
 *   POST   /api/parcels/:id/accept               → ParcelTicket
 *   POST   /api/parcels/:id/decline              → 204
 *   DELETE /api/parcels/:id                      withdraw → 204
 *   GET    /api/parcels/download/:ticket         the file, as a download
 *   POST   /api/parcels/:id/pieces/:to?offset=n  one piece (application/octet-stream) → 204 once it went out
 *
 * WebSocket: `parcel` to the web UIs of the sender and of each recipient (who sees only themselves among the
 * recipients), `parcel-pull` to the tab holding the file, `parcels-missing` as the answer to `parcels-held`.
 */
import { randomBytes } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import {
  API_ERROR_STATUS,
  PROTOCOL_VERSION,
  ParcelOffer,
  TUBE_LIMITS,
  type Locale,
  type Parcel,
  type ParcelEnd,
  type ParcelState,
  type UiParcelsHeld,
} from "@ruumble/protocol";
import { fail, RateLimiter, type ApiErrorCode, type Gate } from "./access.ts";
import { personIdOf, type Hub, type UiHandle, type Viewer } from "./hub.ts";

const v = PROTOCOL_VERSION;
/** progress reaches the web UIs at most this often per parcel */
const PROGRESS_MS = 1000;
/** a Mumble log line holds at most 300 characters (BridgeNotify) */
const NOTIFY_CHARS = 300;

const TEXT: Record<Locale, (name: string, file: string, size: string) => string> = {
  de: (name, file, size) => `Rohrpost von ${name}: ${file} (${size}) – öffne Ruumble, um sie anzunehmen.`,
  en: (name, file, size) => `Tube mail from ${name}: ${file} (${size}) – open Ruumble to accept it.`,
};

/** the line in the recipient's Mumble log, in their language */
export function tubeText(fromName: string, fileName: string, size: number, locale: Locale = "de"): string {
  const file = fileName.length > 120 ? `${fileName.slice(0, 119)}…` : fileName;
  const line = TEXT[locale](fromName.slice(0, 80), file, sizeText(size, locale));
  return line.length <= NOTIFY_CHARS ? line : `${line.slice(0, NOTIFY_CHARS - 1)}…`;
}

function sizeText(bytes: number, locale: Locale): string {
  const [value, unit] = bytes < 1024 * 1024 ? [Math.max(bytes / 1024, 0.1), "KB"] : [bytes / (1024 * 1024), "MB"];
  return `${value.toLocaleString(locale === "de" ? "de-DE" : "en-US", { maximumFractionDigits: 1 })} ${unit}`;
}

/** a file name as it may reach a download: no folders, no control characters, at most 255 characters */
export function cleanName(name: string): string {
  const base = name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/^\.+$/, "");
  return base.slice(0, 255) || "file";
}

/** Content-Disposition for a download: an ASCII fallback and the exact name (RFC 5987) */
export function attachmentHeader(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Bandwidth of all transfers together (ADR-0022): every piece takes its share of time; the confirmation of a piece
 * waits until its share is over, so the sender's next piece comes later. A rate of 0 or less: unlimited.
 */
export class Throttle {
  private next = 0;
  private readonly bytesPerSecond: () => number;
  private readonly now: () => number;

  constructor(bytesPerSecond: () => number, now: () => number = Date.now) {
    this.bytesPerSecond = bytesPerSecond;
    this.now = now;
  }

  /** milliseconds to wait before confirming `bytes` */
  delay(bytes: number): number {
    const rate = this.bytesPerSecond();
    if (rate <= 0) return 0;
    const now = this.now();
    this.next = Math.max(now, this.next) + (bytes / rate) * 1000;
    return this.next - now;
  }
}

interface Transfer {
  res: ServerResponse;
  /** headers sent: the first piece arrived */
  started: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

interface Recipient {
  person: string;
  certHash: string;
  name: string;
  state: ParcelState;
  sent: number;
  ticket: { id: string; timer: ReturnType<typeof setTimeout> } | null;
  transfer: Transfer | null;
}

interface Entry {
  id: string;
  senderHash: string;
  from: string;
  fromName: string;
  name: string;
  type: string;
  size: number;
  note: string;
  at: number;
  until: number;
  holder: UiHandle | null;
  recipients: Recipient[];
  /** withdrawn when it runs out: the sender's tab is gone (grace) */
  grace: ReturnType<typeof setTimeout> | null;
  life: ReturnType<typeof setTimeout>;
  progressAt: number;
  progressTimer: ReturnType<typeof setTimeout> | null;
}

export interface TubeMailOptions {
  hub: Pick<Hub, "personById" | "toUisOf">;
  /** bandwidth of all transfers in bytes per second (0: unlimited), asked anew for every piece */
  bytesPerSecond?: () => number;
  now?: () => number;
}

type Outcome<T> = T | ApiErrorCode;

/** the parcels in flight; only in memory, forgotten when they end */
export class TubeMail {
  private readonly parcels = new Map<string, Entry>();
  private readonly tickets = new Map<string, { entry: Entry; recipient: Recipient }>();
  private readonly offers = new RateLimiter(TUBE_LIMITS.perMinute, 60_000);
  private readonly throttle: Throttle;
  private readonly now: () => number;
  private readonly o: TubeMailOptions;

  constructor(o: TubeMailOptions) {
    this.o = o;
    this.now = o.now ?? Date.now;
    this.throttle = new Throttle(o.bytesPerSecond ?? (() => 0), this.now);
  }

  // ---------------------------------------------------------------- sender

  offer(viewer: Viewer, body: ParcelOffer): Outcome<Parcel> {
    const from = personIdOf(viewer.certHash);
    const known = this.parcels.get(body.id);
    if (known) return known.senderHash === viewer.certHash ? this.view(known, null) : "invalid";
    const open = [...this.parcels.values()].filter((e) => e.senderHash === viewer.certHash).length;
    if (open >= TUBE_LIMITS.openPerPerson) return "rate-limited";
    const recipients: Recipient[] = [];
    for (const person of new Set(body.to)) {
      const p = person === from ? null : this.o.hub.personById(person);
      if (p) recipients.push({ person, certHash: p.certHash, name: p.name, state: "offered", sent: 0, ticket: null, transfer: null });
    }
    if (!recipients.length) return "not-found";
    if (!body.again && this.offers.over(viewer.certHash)) return "rate-limited";
    const at = this.now();
    const entry: Entry = {
      id: body.id, senderHash: viewer.certHash, from, fromName: viewer.name, name: cleanName(body.name), type: body.type, size: body.size,
      note: body.note, at, until: at + TUBE_LIMITS.lifeMs, holder: null, recipients, grace: null, progressAt: 0, progressTimer: null,
      life: unref(setTimeout(() => this.end(entry, "expired"), TUBE_LIMITS.lifeMs)),
    };
    this.parcels.set(entry.id, entry);
    this.startGrace(entry); // until the tab says it holds the file
    this.emit(entry);
    if (!body.again) {
      for (const r of recipients) {
        const p = this.o.hub.personById(r.person);
        p?.notify(tubeText(entry.fromName, entry.name, entry.size, p.locale));
      }
    }
    return this.view(entry, null);
  }

  withdraw(certHash: string, id: string): Outcome<true> {
    const entry = this.parcels.get(id);
    if (!entry || entry.senderHash !== certHash) return "not-found";
    this.end(entry, "withdrawn");
    return true;
  }

  /** one piece from the sender's tab for `to`, from `offset`; resolves once it went out (and the bandwidth allows) */
  async piece(certHash: string, id: string, to: string, offset: number, bytes: Buffer): Promise<Outcome<true>> {
    const entry = this.parcels.get(id);
    const r = entry?.recipients.find((x) => x.person === to);
    if (!entry || entry.senderHash !== certHash || !r?.transfer) return "not-found";
    if (offset !== r.sent || !bytes.length || bytes.length > TUBE_LIMITS.pieceBytes || r.sent + bytes.length > entry.size) {
      this.fail(entry, r, "invalid"); // more than announced, or out of order: the download must not end up short or wrong
      return "invalid";
    }
    const t = r.transfer;
    if (!t.started) {
      t.started = true;
      if (t.timer) clearTimeout(t.timer);
      t.res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(entry.size),
        "Content-Disposition": attachmentHeader(entry.name),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });
      r.state = "receiving";
      this.emit(entry);
    }
    if (!(await write(t.res, bytes)) || r.transfer !== t) return "not-found";
    r.sent += bytes.length;
    const wait = this.throttle.delay(bytes.length);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    if (r.sent === entry.size) {
      r.transfer = null;
      r.state = "received";
      t.res.end();
      this.emit(entry);
      this.endIfDone(entry);
    } else {
      this.progress(entry);
    }
    return true;
  }

  // ---------------------------------------------------------------- recipient

  /** a ticket for the download; the sender's tab has to be there */
  accept(certHash: string, id: string): Outcome<{ ticket: string }> {
    const found = this.recipient(certHash, id);
    if (typeof found === "string") return found;
    const { entry, recipient: r } = found;
    if (r.transfer || !["offered", "failed", "accepted"].includes(r.state)) return "invalid";
    if (!entry.holder) return "sender-away";
    this.dropTicket(r);
    const ticket = randomBytes(16).toString("hex");
    r.ticket = {
      id: ticket,
      // not used in time: back to offered
      timer: unref(setTimeout(() => {
        this.dropTicket(r);
        if (r.state === "accepted" && !r.transfer) this.set(entry, r, "offered");
      }, TUBE_LIMITS.ticketMs)),
    };
    this.tickets.set(ticket, { entry, recipient: r });
    r.sent = 0;
    this.set(entry, r, "accepted");
    return { ticket };
  }

  decline(certHash: string, id: string): Outcome<true> {
    const found = this.recipient(certHash, id);
    if (typeof found === "string") return found;
    const { entry, recipient: r } = found;
    if (r.transfer || r.state === "received" || r.state === "declined") return "invalid";
    this.dropTicket(r);
    this.set(entry, r, "declined");
    this.endIfDone(entry);
    return true;
  }

  /** the download: waits for the sender's first piece, then the pieces as they come */
  download(certHash: string, ticket: string, res: ServerResponse): Outcome<true> {
    const found = this.tickets.get(ticket);
    if (!found || found.recipient.certHash !== certHash) return "not-found";
    const { entry, recipient: r } = found;
    this.dropTicket(r);
    if (!entry.holder) {
      this.set(entry, r, "failed");
      return "sender-away";
    }
    const transfer: Transfer = { res, started: false, timer: null };
    transfer.timer = unref(setTimeout(() => {
      if (r.transfer !== transfer) return;
      this.fail(entry, r);
    }, TUBE_LIMITS.firstPieceMs));
    // the recipient cancelled the download or the connection broke
    res.on("close", () => {
      if (r.transfer === transfer) this.fail(entry, r);
    });
    r.transfer = transfer;
    r.sent = 0;
    entry.holder.send({ v, type: "parcel-pull", id: entry.id, to: r.person, offset: 0 });
    return true;
  }

  // ---------------------------------------------------------------- web UIs

  /** a paired web UI connected: the parcels of its person, sent and received */
  connected(ui: UiHandle): void {
    for (const entry of this.parcels.values()) {
      if (entry.senderHash === ui.certHash) ui.send({ v, type: "parcel", parcel: this.view(entry, null) });
      else if (entry.recipients.some((r) => r.certHash === ui.certHash)) ui.send({ v, type: "parcel", parcel: this.view(entry, ui.certHash) });
    }
  }

  /** the parcels this tab holds: it becomes their holder; those it no longer holds lose it; unknown ones it offers again */
  held(ui: UiHandle, msg: UiParcelsHeld): void {
    const ids = new Set(msg.ids);
    for (const entry of this.parcels.values()) {
      if (entry.senderHash !== ui.certHash) continue;
      if (ids.has(entry.id)) {
        if (entry.holder === ui) continue;
        entry.holder = ui;
        if (entry.grace) clearTimeout(entry.grace);
        entry.grace = null;
        this.emit(entry);
        // downloads that waited for the tab
        for (const r of entry.recipients) if (r.transfer && !r.transfer.started) ui.send({ v, type: "parcel-pull", id: entry.id, to: r.person, offset: 0 });
      } else if (entry.holder === ui) {
        this.loseHolder(entry);
      }
    }
    const missing = msg.ids.filter((id) => !this.parcels.has(id));
    if (missing.length) ui.send({ v, type: "parcels-missing", ids: missing });
  }

  closed(ui: UiHandle): void {
    for (const entry of this.parcels.values()) if (entry.holder === ui) this.loseHolder(entry);
  }

  /** for tests and /healthz */
  get size(): number {
    return this.parcels.size;
  }

  // ---------------------------------------------------------------- internal

  private recipient(certHash: string, id: string): Outcome<{ entry: Entry; recipient: Recipient }> {
    const entry = this.parcels.get(id);
    const recipient = entry?.recipients.find((r) => r.certHash === certHash);
    return entry && recipient ? { entry, recipient } : "not-found";
  }

  private loseHolder(entry: Entry): void {
    entry.holder = null;
    this.startGrace(entry);
    this.emit(entry);
  }

  private startGrace(entry: Entry): void {
    if (entry.grace) clearTimeout(entry.grace);
    entry.grace = unref(setTimeout(() => this.end(entry, "sender-gone"), TUBE_LIMITS.graceMs));
  }

  /** a transfer broke: the download is aborted (or refused, before it began), the recipient may accept again */
  private fail(entry: Entry, r: Recipient, error: ApiErrorCode = "sender-away"): void {
    const t = r.transfer;
    r.transfer = null;
    if (t) stop(t, error);
    this.set(entry, r, "failed");
  }

  private dropTicket(r: Recipient): void {
    if (!r.ticket) return;
    clearTimeout(r.ticket.timer);
    this.tickets.delete(r.ticket.id);
    r.ticket = null;
  }

  private set(entry: Entry, r: Recipient, state: ParcelState): void {
    r.state = state;
    this.emit(entry);
  }

  private endIfDone(entry: Entry): void {
    if (entry.recipients.every((r) => r.state === "received" || r.state === "declined")) this.end(entry, "done");
  }

  private end(entry: Entry, reason: ParcelEnd): void {
    if (this.parcels.get(entry.id) !== entry) return;
    this.parcels.delete(entry.id);
    for (const timer of [entry.grace, entry.life, entry.progressTimer]) if (timer) clearTimeout(timer);
    for (const r of entry.recipients) {
      this.dropTicket(r);
      const t = r.transfer;
      r.transfer = null;
      if (t) stop(t, "sender-away");
    }
    this.emit(entry, reason);
  }

  /** progress: at most once a second per parcel */
  private progress(entry: Entry): void {
    if (entry.progressTimer) return;
    const wait = entry.progressAt + PROGRESS_MS - this.now();
    if (wait <= 0) return this.emit(entry);
    entry.progressTimer = unref(setTimeout(() => {
      entry.progressTimer = null;
      if (this.parcels.get(entry.id) === entry) this.emit(entry);
    }, wait));
  }

  private emit(entry: Entry, ended: ParcelEnd | null = null): void {
    entry.progressAt = this.now();
    this.o.hub.toUisOf(entry.senderHash, { v, type: "parcel", parcel: this.view(entry, null, ended) });
    for (const r of entry.recipients) this.o.hub.toUisOf(r.certHash, { v, type: "parcel", parcel: this.view(entry, r.certHash, ended) });
  }

  /** `recipient`: the view of that recipient (only themselves), null: the sender's */
  private view(entry: Entry, recipient: string | null, ended: ParcelEnd | null = null): Parcel {
    const recipients = entry.recipients.filter((r) => recipient === null || r.certHash === recipient);
    return {
      id: entry.id, from: entry.from, fromName: entry.fromName, name: entry.name, type: entry.type, size: entry.size, note: entry.note,
      at: entry.at, until: entry.until, holder: entry.holder !== null, ended,
      recipients: recipients.map((r) => ({ person: r.person, name: r.name, state: r.state, sent: r.sent })),
    };
  }
}

/** end a download that is not complete: refused with `error` before its headers, aborted after them */
function stop(t: Transfer, error: ApiErrorCode): void {
  if (t.timer) clearTimeout(t.timer);
  if (t.res.writableEnded || t.res.destroyed) return;
  if (t.started) t.res.destroy();
  else t.res.writeHead(API_ERROR_STATUS[error], { "Content-Type": "application/json" }).end(JSON.stringify({ error }));
}

/** write and wait until the response takes more; false if it closed */
function write(res: ServerResponse, bytes: Buffer): Promise<boolean> {
  if (res.destroyed || res.writableEnded) return Promise.resolve(false);
  if (res.write(bytes)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      res.off("drain", onDrain);
      res.off("close", onClose);
      resolve(ok);
    };
    const onDrain = () => done(true);
    const onClose = () => done(false);
    res.on("drain", onDrain);
    res.on("close", onClose);
  });
}

function unref<T extends ReturnType<typeof setTimeout>>(timer: T): T {
  (timer as { unref?: () => void }).unref?.();
  return timer;
}

const ID = /^[0-9a-f]{32}$/;

export interface TubeRouteOptions {
  mail: TubeMail;
  /** who is asking (access.ts): sending needs a connected plugin, accepting only the paired browser */
  gate: Gate;
}

export async function tubeRoutes(app: FastifyInstance, o: TubeRouteOptions): Promise<void> {
  // pieces arrive as they are; only in this module (encapsulated)
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: TUBE_LIMITS.pieceBytes }, (_req, body, done) => done(null, body));
  const answer = (reply: Parameters<typeof fail>[0], outcome: Outcome<true | object>) =>
    typeof outcome === "string" ? fail(reply, outcome) : outcome === true ? reply.code(204).send() : outcome;

  app.post("/api/parcels", async (req, reply) => {
    const viewer = o.gate.viewer(req);
    if (!viewer) return fail(reply, "not-paired");
    const body = ParcelOffer.safeParse(req.body);
    if (!body.success) return fail(reply, "invalid");
    return answer(reply, o.mail.offer(viewer, body.data));
  });

  app.post<{ Params: { id: string } }>("/api/parcels/:id/accept", async (req, reply) => {
    const certHash = o.gate.certHash(req);
    if (!certHash) return fail(reply, "not-paired");
    return answer(reply, o.mail.accept(certHash, req.params.id));
  });

  app.post<{ Params: { id: string } }>("/api/parcels/:id/decline", async (req, reply) => {
    const certHash = o.gate.certHash(req);
    if (!certHash) return fail(reply, "not-paired");
    return answer(reply, o.mail.decline(certHash, req.params.id));
  });

  app.delete<{ Params: { id: string } }>("/api/parcels/:id", async (req, reply) => {
    const certHash = o.gate.certHash(req);
    if (!certHash) return fail(reply, "not-paired");
    return answer(reply, o.mail.withdraw(certHash, req.params.id));
  });

  app.get<{ Params: { ticket: string } }>("/api/parcels/download/:ticket", async (req, reply) => {
    const certHash = o.gate.certHash(req);
    if (!certHash) return fail(reply, "not-paired");
    if (!ID.test(req.params.ticket)) return fail(reply, "not-found");
    const outcome = o.mail.download(certHash, req.params.ticket, reply.raw);
    if (outcome !== true) return fail(reply, outcome);
    reply.hijack(); // the response is written piece by piece as the sender's tab sends them
  });

  app.post<{ Params: { id: string; to: string }; Querystring: { offset?: string } }>("/api/parcels/:id/pieces/:to", async (req, reply) => {
    const certHash = o.gate.certHash(req);
    if (!certHash) return fail(reply, "not-paired");
    const offset = Number(req.query.offset);
    if (!Buffer.isBuffer(req.body) || !Number.isSafeInteger(offset) || offset < 0) return fail(reply, "invalid");
    return answer(reply, await o.mail.piece(certHash, req.params.id, req.params.to, offset, req.body));
  });
}
