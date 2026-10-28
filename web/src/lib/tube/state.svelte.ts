/**
 * Tube mail in the web UI (ADR-0022): the parcels of the own person, the panel in the top bar, the send dialog, the
 * notice of a new parcel, and the files this tab holds. A file stays in this tab until every recipient has it or
 * declined; the service asks for it piece by piece (`pull`) whenever someone accepts. Nothing is kept in storage.
 */
import { TUBE_LIMITS, type Parcel } from "@ruumble/protocol";
import type { BoardErrorCode, MumbleAdapter } from "../adapter/types.ts";
import { t } from "../i18n/index.svelte.ts";
import { fileProblem, incoming, merge, mine, newParcelId, outgoing, sendingProgress, stillNeeded, stillOpen, waiting, waitingCount, without, type Parcels } from "./model.ts";

/** the send dialog while it is open */
export interface Draft {
  file: File | null;
  /** chosen people (snapshot `person`) */
  to: string[];
  note: string;
}

/** what the tube mail needs from the rest of the web UI */
export interface TubeHost {
  notice(text: string): void;
  /** start the browser's download of this address (a click on a link with `download`) */
  download(url: string, name: string): void;
  /** a parcel for the own person arrived, from this sender */
  arrived(name: string): void;
}

/** plain text for a request that did not go through */
export function tubeErrorText(error: BoardErrorCode): string {
  const m = t().tube.errors;
  return error === "rate-limited" ? m.rateLimited
    : error === "not-found" ? m.gone
    : error === "sender-away" ? m.senderAway
    : error === "invalid" ? m.invalid
    : error === "not-paired" ? t().common.mumbleOffline
    : error === "offline" ? t().boardErrors.offline
    : t().notices.actionFailed;
}

export class TubeState {
  parcels = $state<Parcels>({});
  /** the panel in the top bar */
  panel = $state(false);
  draft = $state<Draft | null>(null);
  /** a new received parcel shown as a notice */
  toast = $state<string | null>(null);
  busy = $state(false);
  /** the own person (snapshot `person`) */
  me = $state<string | null>(null);

  incoming = $derived(incoming(this.parcels, this.me));
  outgoing = $derived(outgoing(this.parcels, this.me));
  waiting = $derived(waitingCount(this.parcels, this.me));
  /** 0…1 while own parcels are on their way, null otherwise */
  progress = $derived(sendingProgress(this.parcels, this.me));

  /** the files of own parcels, by parcel id; only in this tab */
  private readonly files = new Map<string, File>();
  /** the upload running per parcel and recipient; a new pull replaces it */
  private readonly uploads = new Map<string, symbol>();
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly adapter: MumbleAdapter,
    private readonly host: TubeHost,
  ) {}

  start(): void {
    // closing the tab ends the parcels whose file is here: the browser asks first
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (stillNeeded(this.parcels, this.files.keys())) e.preventDefault();
    };
    addEventListener("beforeunload", beforeUnload);
    this.cleanup.push(() => removeEventListener("beforeunload", beforeUnload));
  }

  stop(): void {
    for (const fn of this.cleanup.splice(0)) fn();
  }

  identify(me: string | null): void {
    if (me) this.me = me;
  }

  /** this browser is no longer paired: everything here is dropped */
  forgetAll(): void {
    this.parcels = {};
    this.files.clear();
    this.uploads.clear();
    this.panel = false;
    this.draft = null;
    this.toast = null;
    this.me = null;
    this.adapter.tube.held([]);
  }

  // ---------------------------------------------------------------- panel and dialog

  togglePanel(): void {
    this.panel = !this.panel;
  }

  closePanel(): void {
    this.panel = false;
  }

  /** the send dialog, with a file (dropped on a room) and people already chosen */
  compose(file: File | null = null, to: string[] = []): void {
    this.panel = false;
    this.draft = { file, to, note: "" };
    if (file) this.checkFile(file);
  }

  setFile(file: File): void {
    if (this.draft && this.checkFile(file)) this.draft = { ...this.draft, file };
  }

  setRecipients(to: string[]): void {
    if (this.draft) this.draft = { ...this.draft, to };
  }

  setNote(note: string): void {
    if (this.draft) this.draft = { ...this.draft, note };
  }

  closeDraft(): void {
    this.draft = null;
  }

  /** offer the drafted file; true once it went out */
  async send(): Promise<boolean> {
    const d = this.draft;
    if (!d?.file || !d.to.length || !this.checkFile(d.file)) return false;
    const id = newParcelId();
    this.busy = true;
    this.files.set(id, d.file);
    const r = await this.adapter.tube.offer({ id, to: d.to, name: d.file.name, type: d.file.type, size: d.file.size, note: d.note.trim().slice(0, TUBE_LIMITS.noteChars) });
    this.busy = false;
    if (!r.ok) {
      this.files.delete(id);
      this.host.notice(tubeErrorText(r.error));
      return false;
    }
    this.receive(r.value);
    this.adapter.tube.held([...this.files.keys()]);
    this.draft = null;
    this.panel = true; // where it goes on from here
    return true;
  }

  withdraw(id: string): Promise<boolean> {
    return this.ask(this.adapter.tube.withdraw(id));
  }

  // ---------------------------------------------------------------- received

  /** accept: the download starts at once, while the click still counts as the user's */
  async accept(id: string): Promise<boolean> {
    if (this.toast === id) this.toast = null;
    const r = await this.adapter.tube.accept(id);
    if (!r.ok) {
      this.host.notice(tubeErrorText(r.error));
      return false;
    }
    this.host.download(this.adapter.tube.downloadUrl(r.value), this.parcels[id]?.name ?? "");
    return true;
  }

  decline(id: string): Promise<boolean> {
    if (this.toast === id) this.toast = null;
    return this.ask(this.adapter.tube.decline(id));
  }

  /** "Later": the notice goes, the parcel stays in the panel */
  later(): void {
    this.toast = null;
  }

  /** put a parcel away that needs nothing more: ended, or received or declined by the own person */
  dismiss(id: string): void {
    const p = this.parcels[id];
    const state = p ? mine(p, this.me)?.state : undefined;
    if (p && (p.ended !== null || state === "received" || state === "declined")) this.parcels = without(this.parcels, id);
  }

  // ---------------------------------------------------------------- from the service

  receive(parcel: Parcel): void {
    const known = this.parcels[parcel.id];
    this.parcels = merge(this.parcels, parcel);
    if (parcel.from === this.me) {
      if (parcel.ended !== null) this.release(parcel.id);
    } else if (!known && waiting(parcel, this.me)) {
      this.toast = parcel.id;
      this.host.arrived(parcel.fromName);
    } else if (this.toast === parcel.id && !waiting(parcel, this.me)) {
      this.toast = null;
    }
  }

  /** the service asks this tab for the file: piece after piece until done, replaced, or refused */
  async pull(id: string, to: string, offset: number): Promise<void> {
    const file = this.files.get(id);
    if (!file) return;
    const key = `${id}:${to}`;
    const run = Symbol(key);
    this.uploads.set(key, run);
    for (let at = offset; at < file.size && this.uploads.get(key) === run; at += TUBE_LIMITS.pieceBytes) {
      const r = await this.adapter.tube.piece(id, to, at, file.slice(at, at + TUBE_LIMITS.pieceBytes));
      if (!r.ok) break;
    }
    if (this.uploads.get(key) === run) this.uploads.delete(key);
  }

  /** the service restarted and forgot these parcels: offer them again to whoever has not got them yet */
  async missing(ids: string[]): Promise<void> {
    for (const id of ids) {
      const file = this.files.get(id);
      const known = this.parcels[id];
      const to = known ? stillOpen(known) : [];
      if (!file || !known || !to.length) {
        this.release(id);
        continue;
      }
      const r = await this.adapter.tube.offer({ id, to, name: known.name, type: known.type, size: known.size, note: known.note, again: true });
      if (r.ok) this.receive(r.value);
      else this.release(id);
    }
  }

  // ---------------------------------------------------------------- internal

  /** a file is no longer needed: dropped from this tab */
  private release(id: string): void {
    if (!this.files.delete(id)) return;
    for (const key of [...this.uploads.keys()]) if (key.startsWith(`${id}:`)) this.uploads.delete(key);
    this.adapter.tube.held([...this.files.keys()]);
  }

  private checkFile(file: File): boolean {
    const problem = fileProblem(file.size);
    if (problem) this.host.notice(problem === "empty" ? t().tube.errors.empty : t().tube.errors.tooLarge);
    return !problem;
  }

  private async ask(request: Promise<{ ok: true } | { ok: false; error: BoardErrorCode }>): Promise<boolean> {
    const r = await request;
    if (!r.ok) this.host.notice(tubeErrorText(r.error));
    return r.ok;
  }
}
