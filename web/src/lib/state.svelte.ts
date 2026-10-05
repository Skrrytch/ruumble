/**
 * State of the web UI: holds the latest snapshot, derives the building and runs commands.
 * No optimistic switching: the own channel only changes with the next snapshot (ADR-0003).
 */
import { BOARD_LIMITS, type Attachment, type BoardView, type BuildingCare, type BuildingSettings, type FloorCare, type KeyCabinet, type Maintenance, type RoomCare, type CommandResult, type PostKind, type Post, type ReactionKind, type Snapshot, type StatusView, type TalkingState, type Uploaded, type Versions } from "@ruumble/protocol";
import type { BoardErrorCode, BoardResult, ConnectionState, MumbleAdapter, PairErrorCode, PluginStatus } from "./adapter/types.ts";
import { formatSize, newestPost, parseSeen, unseenPosts, type BoardFilter, type CopyTarget } from "./board/model.ts";
import type { CareTarget } from "./care/model.ts";
import { t } from "./i18n/index.svelte.ts";
import { avatarUrlOf, buildBuilding, homeFloor, type BuildOptions, type Building, type Floor } from "./model/building.ts";

export type Notice = { text: string };

/** Plain text for a board error in the web UI's language; `maxFileBytes`: the largest attachment the service takes */
export function boardErrorText(error: BoardErrorCode, maxFileBytes: number = BOARD_LIMITS.fileBytes): string {
  const m = t().boardErrors[error];
  return typeof m === "function" ? m(formatSize(maxFileBytes)) : m;
}

/** Plain text for an error when setting the status (B) */
export function statusErrorText(error: BoardErrorCode): string {
  return error === "invalid" ? t().status.invalid : boardErrorText(error);
}

/** Plain text for an error of a care action */
export function careErrorText(error: BoardErrorCode): string {
  return error === "not-found" || error === "forbidden" ? t().care.errors[error] : boardErrorText(error);
}

export type { CareTarget };
export type CareView = { kind: "room"; value: RoomCare } | { kind: "floor"; value: FloorCare } | { kind: "building"; value: BuildingCare };

/** per room: creation time of the newest post the user has seen on its board (only in this browser) */
const SEEN_KEY = "ruumble.boardSeen";

export class RuumbleState {
  snapshot = $state<Snapshot | null>(null);
  plugin = $state<PluginStatus>("disconnected");
  /** read-only, without own user (service preview) */
  preview = $state(false);
  connection = $state<ConnectionState>("connected");
  /** versions of service and offered plugin, shown on the notice pages */
  versions = $state<Versions | null>(null);
  /** pairing with a code (ADR-0012): request ID once a code was sent, last error, request running */
  pairRequest = $state<string | null>(null);
  pairError = $state<PairErrorCode | null>(null);
  pairBusy = $state(false);
  /** session → currently talking (only what the own client hears) */
  talking = $state<Record<number, boolean>>({});
  /** channel switch in progress (transitional state) */
  pendingChannel = $state<number | null>(null);
  notice = $state<Notice | null>(null);
  /** Board sidebar: hidden initially, the toggle is the graphic in your own room (ADR-0011) */
  boardOpen = $state(false);
  board = $state<BoardView | null>(null);
  boardError = $state<BoardErrorCode | null>(null);
  boardFilter = $state<BoardFilter>("all");
  /** free-text search over the loaded posts of the room (simple form of A7) */
  boardQuery = $state("");
  /** posts by others in the current room that arrived since the board was last open there (closed toggle) */
  boardUnseen = $state(0);
  /** the posts that were unseen when the board was opened: they light up once in the sidebar */
  boardRevealed: string[] = [];
  /** care dialog (ADR-0014): target, what the service reported, a running action, its result or error */
  care = $state<CareTarget | null>(null);
  careView = $state<CareView | null>(null);
  careBusy = $state(false);
  careMessage = $state<string | null>(null);
  careError = $state<BoardErrorCode | null>(null);
  /** care levels opened from an overview (building → floor → room), for "back" */
  careTrail = $state<CareTarget[]>([]);
  /** building maintenance (ADR-0016): open, what the service reported, saving, the result or error */
  maintenanceOpen = $state(false);
  maintenance = $state<Maintenance | null>(null);
  maintenanceBusy = $state(false);
  maintenanceMessage = $state<string | null>(null);
  maintenanceError = $state<BoardErrorCode | null>(null);
  /** key cabinet (ADR-0015): open (own keys, user menu), what the service reported, a running revoke, its error */
  keysOpen = $state(false);
  keys = $state<KeyCabinet | null>(null);
  keysBusy = $state(false);
  keysError = $state<BoardErrorCode | null>(null);
  /** building overview (ADR-0019): cross-section and directory, opened from the elevator's status bar or with H */
  overviewOpen = $state(false);
  /** the own status (B, ADR-0018): dialog open, what the service reported (current and recent texts), saving, error */
  statusOpen = $state(false);
  status = $state<StatusView | null>(null);
  statusBusy = $state(false);
  statusError = $state<BoardErrorCode | null>(null);
  private boardChannel: number | null = null;
  private boardSeen = readSeen();

  /** displayed floor; `null` = own or first displayable one */
  private viewFloorId = $state<number | null>(null);

  building: Building | null = $derived.by(() => {
    if (!this.snapshot) return null;
    return buildBuilding(this.snapshot, this.avatarOptions);
  });

  /** how avatar images are addressed: the mock has its own, otherwise /avatar/<id> */
  get avatarOptions(): BuildOptions {
    const custom = this.adapter.avatarUrl?.bind(this.adapter);
    return custom ? { avatarUrl: custom } : {};
  }

  /** Avatar image of a currently connected user (user area, board); otherwise `null` → initials */
  avatarOf(name: string): string | null {
    const u = this.snapshot?.users.find((x) => x.name === name);
    if (!u) return null;
    const custom = this.adapter.avatarUrl?.bind(this.adapter);
    return custom ? avatarUrlOf(u, custom) : avatarUrlOf(u);
  }

  /** displayed floor */
  floor: Floor | null = $derived.by(() => {
    const b = this.building;
    if (!b) return null;
    return b.floors.find((f) => f.channelId === this.viewFloorId && (!f.lock || f.isSelf)) ?? homeFloor(b);
  });

  /** largest attachment the service takes (building maintenance), known once a board was loaded */
  maxFileBytes = $derived(this.board?.maxFileBytes ?? BOARD_LIMITS.fileBytes);

  /** Without an own user everything is read-only. */
  readonly = $derived(!this.snapshot?.self);

  me = $derived(this.snapshot?.users.find((u) => u.session === this.snapshot?.self?.session) ?? null);

  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly adapter: MumbleAdapter) {}

  start(): void {
    void this.adapter.versions().then((v) => (this.versions = v));
    this.adapter.start({
      snapshot: (s) => this.onSnapshot(s),
      talking: (session, state) => this.onTalking(session, state),
      status: (plugin, preview) => {
        this.plugin = plugin;
        this.preview = preview;
        this.connection = "connected";
      },
      connection: (state) => {
        this.connection = state;
        if (state === "unpaired") {
          // e.g. this browser's key was just revoked
          this.closeKeys();
          this.closeMaintenance();
          this.closeStatus();
        }
      },
      // also while closed: the toggle shows posts the user has not seen yet
      board: (channelId) => {
        if (this.me?.channel === channelId) void this.loadBoard();
      },
    });
  }

  stop(): void {
    this.adapter.stop();
  }

  async requestPairing(): Promise<void> {
    this.pairBusy = true;
    const r = await this.adapter.pairing.request();
    this.pairBusy = false;
    this.pairError = r.ok ? null : r.error;
    if (r.ok) this.pairRequest = r.value;
    else if (r.error !== "rate-limited") this.pairRequest = null;
  }

  /** spaces and dashes in the code are ignored ("482 913") */
  async confirmPairing(code: string): Promise<void> {
    if (!this.pairRequest) return;
    this.pairBusy = true;
    const r = await this.adapter.pairing.confirm(this.pairRequest, code.replace(/[\s-]/g, ""));
    this.pairBusy = false;
    this.pairError = r.ok ? null : r.error;
    if (r.ok || r.error === "expired") this.pairRequest = null;
  }

  showFloor(floor: Floor): void {
    if (floor.lock && !floor.isSelf) return;
    this.viewFloorId = floor.channelId;
  }

  goHome(): void {
    this.viewFloorId = null;
  }

  async join(channelId: number): Promise<void> {
    if (this.readonly || this.me?.channel === channelId) return;
    this.pendingChannel = channelId;
    const result = await this.adapter.command({ cmd: "join", channel: channelId });
    if (this.pendingChannel === channelId) this.pendingChannel = null;
    this.report(result, channelId);
  }

  /** Microphone button: pressed = muted or deafened; a click toggles the target state (Mumble lifts deaf along with it). */
  async toggleMute(): Promise<void> {
    const me = this.me;
    if (!me) return;
    this.report(await this.adapter.command({ cmd: "mute", on: !(me.selfMute || me.selfDeaf) }));
  }

  async toggleDeaf(): Promise<void> {
    const me = this.me;
    if (!me) return;
    this.report(await this.adapter.command({ cmd: "deaf", on: !me.selfDeaf }));
  }

  // ---------------------------------------------------------------- Board

  toggleBoard(): void {
    this.boardOpen = !this.boardOpen;
    if (this.boardOpen) {
      const b = this.board;
      const seenAt = b && b.channelId === this.me?.channel ? this.boardSeen[String(b.channelId)] : undefined;
      this.boardRevealed = b && seenAt !== undefined ? unseenPosts(b.posts, seenAt).map((p) => p.id) : [];
      this.boardUnseen = 0;
      void this.loadBoard();
    }
  }

  closeBoard(): void {
    this.boardOpen = false;
  }

  async loadBoard(): Promise<void> {
    this.boardChannel = this.me?.channel ?? null;
    const r = await this.adapter.board.load();
    if (r.ok) {
      this.board = r.value;
      this.boardError = null;
      this.trackSeen(r.value);
    } else {
      this.board = null;
      this.boardError = r.error;
      this.boardUnseen = 0;
    }
  }

  /** Open board: everything counts as seen. Closed: count what arrived since. A room seen for the first time starts as seen. */
  private trackSeen(view: BoardView): void {
    const key = String(view.channelId);
    const seenAt = this.boardSeen[key];
    if (this.boardOpen || seenAt === undefined) {
      this.boardUnseen = 0;
      const newest = newestPost(view.posts);
      if (seenAt !== newest) this.storeSeen(key, newest);
    } else {
      this.boardUnseen = unseenPosts(view.posts, seenAt).length;
    }
  }

  private storeSeen(key: string, at: number): void {
    this.boardSeen = { ...this.boardSeen, [key]: at };
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(this.boardSeen));
    } catch {
      /* private mode: only remembered until reload */
    }
  }

  /** Pin a post; `true` on success (the input is then cleared) */
  async pin(kind: PostKind, text: string, language?: string): Promise<boolean> {
    const r = await this.adapter.board.create({ kind, text, ...(language ? { language } : {}) });
    if (!r.ok) return this.boardFailed(r.error);
    await this.loadBoard();
    return true;
  }

  /** Upload an attachment; the input shows the progress and then pins it with `pinAttachment` */
  upload(file: Blob, name: string, onProgress?: (fraction: number) => void): Promise<BoardResult<Uploaded>> {
    return this.adapter.board.upload(file, name, onProgress);
  }

  async pinAttachment(attachment: Uploaded, caption: string): Promise<boolean> {
    const r = await this.adapter.board.create({ kind: attachment.image ? "image" : "file", text: caption, attachmentId: attachment.id, attachmentName: attachment.name });
    if (!r.ok) return this.boardFailed(r.error);
    await this.loadBoard();
    return true;
  }

  fileUrl(attachment: Attachment, download = false): string {
    return this.adapter.board.fileUrl(attachment, download);
  }


  async editPost(id: string, text: string, language?: string): Promise<boolean> {
    const r = await this.adapter.board.update(id, { text, ...(language ? { language } : {}) });
    if (!r.ok) return this.boardFailed(r.error);
    await this.loadBoard();
    return true;
  }

  async deletePost(id: string): Promise<boolean> {
    const r = await this.adapter.board.remove(id);
    if (!r.ok) return this.boardFailed(r.error);
    await this.loadBoard();
    return true;
  }

  /** copy a post to another room; the own board stays as it is, a notice confirms it */
  async copyPost(post: Post, target: CopyTarget): Promise<boolean> {
    const r = await this.adapter.board.copy(post.id, target.channelId);
    if (!r.ok) return this.boardFailed(r.error);
    this.setNotice({ text: t().board.copiedTo(target.name) });
    return true;
  }

  /** keep a post on top of the room (A3); the board reloads like after pinning a post */
  async pinPost(post: Post, title: string): Promise<boolean> {
    const r = await this.adapter.board.pin(post.id, title);
    if (!r.ok) return this.boardFailed(r.error);
    await this.loadBoard();
    return true;
  }

  async unpinPost(): Promise<boolean> {
    const r = await this.adapter.board.unpin();
    if (!r.ok) return this.boardFailed(r.error);
    await this.loadBoard();
    return true;
  }

  /** tick or untick one task (A2); like reactions, the card shows the service's answer */
  async toggleTask(post: Post, index: number, done: boolean): Promise<void> {
    const r = await this.adapter.board.toggleTask(post.id, index, done);
    if (!r.ok) return void this.boardFailed(r.error);
    this.replacePost(r.value);
  }

  /** toggle the own quick reaction (A1); the card shows the service's answer, the others reload */
  async react(post: Post, kind: ReactionKind): Promise<void> {
    const on = !post.reactions.some((r) => r.kind === kind && r.mine);
    const r = await this.adapter.board.react(post.id, kind, on);
    if (!r.ok) return void this.boardFailed(r.error);
    this.replacePost(r.value);
  }

  private replacePost(post: Post): void {
    if (this.board) this.board = { ...this.board, posts: this.board.posts.map((p) => (p.id === post.id ? post : p)) };
  }

  private boardFailed(error: BoardErrorCode): false {
    this.setNotice({ text: boardErrorText(error, this.maxFileBytes) });
    return false;
  }

  // ---------------------------------------------------------------- Care (ADR-0014)

  /** `from`: opened from an overview line, "back" returns there */
  openCare(target: CareTarget, from = false): Promise<void> {
    return this.showCare(target, from && this.care ? [...this.careTrail, this.care] : []);
  }

  /** the trail is set together with the level, so "back" stays while the level loads */
  private async showCare(target: CareTarget, trail: CareTarget[]): Promise<void> {
    this.careTrail = trail;
    this.care = target;
    this.careView = null;
    this.careMessage = null;
    this.careError = null;
    await this.loadCare();
  }

  closeCare(): void {
    this.care = null;
    this.careView = null;
    this.careTrail = [];
  }

  /** breadcrumb: go to a parent level; the trail is cut there, or starts anew if that level was not on it */
  async careJump(target: CareTarget): Promise<void> {
    const same = (a: CareTarget) => a.kind === target.kind && (a.kind === "building" || (target.kind !== "building" && a.channelId === target.channelId));
    const at = this.careTrail.findIndex(same);
    await this.showCare(target, at >= 0 ? this.careTrail.slice(0, at) : []);
  }

  async careBack(): Promise<void> {
    const trail = this.careTrail;
    const previous = trail.at(-1);
    if (!previous) return;
    await this.showCare(previous, trail.slice(0, -1));
  }

  private async loadCare(): Promise<void> {
    const target = this.care;
    if (!target) return;
    const api = this.adapter.care;
    const r: BoardResult<CareView> =
      target.kind === "room" ? wrap("room", await api.room(target.channelId))
      : target.kind === "floor" ? wrap("floor", await api.floor(target.channelId))
      : wrap("building", await api.building());
    if (this.care !== target) return; // closed or another plant meanwhile
    if (r.ok) this.careView = r.value;
    else this.careError = r.error;
  }

  /** run a care action, then show its result and what the service reports now */
  private async careAction<T>(run: () => Promise<BoardResult<T>>, message: (value: T) => string): Promise<boolean> {
    const target = this.care;
    this.careBusy = true;
    this.careMessage = null;
    this.careError = null;
    const r = await run();
    this.careBusy = false;
    if (this.care !== target) return r.ok; // closed or another level meanwhile: the result belongs to that one
    if (!r.ok) {
      this.careError = r.error;
      return false;
    }
    this.careMessage = message(r.value);
    await this.loadCare();
    return true;
  }

  clearRoom(): Promise<boolean> {
    const target = this.care;
    if (target?.kind !== "room") return Promise.resolve(false);
    return this.careAction(() => this.adapter.care.clearRoom(target.channelId), (v) => t().care.cleared(t().care.posts(v.posts)));
  }

  /** building care: forget the learned links of these projects */
  forgetTickets(projects: string[]): Promise<boolean> {
    if (this.care?.kind !== "building" || !projects.length) return Promise.resolve(false);
    return this.careAction(() => this.adapter.care.forgetTickets(projects), () => t().care.ticketsForgotten(projects.length));
  }

  pruneRoom(days: number): Promise<boolean> {
    const target = this.care;
    if (target?.kind !== "room") return Promise.resolve(false);
    return this.careAction(() => this.adapter.care.pruneRoom(target.channelId, days), (v) => t().care.pruned(t().care.posts(v.posts)));
  }

  /** the board as a file: the browser saves it */
  exportRoom(): Promise<boolean> {
    const target = this.care;
    if (target?.kind !== "room") return Promise.resolve(false);
    let cancelled = false;
    return this.careAction(async (): Promise<BoardResult<{ name: string }>> => {
      const r = await this.adapter.care.exportRoom(target.channelId);
      if (!r.ok) return r;
      const saved = await saveStream(r.value.stream, r.value.name);
      if (saved === "failed") return { ok: false, error: "offline" };
      cancelled = saved === "cancelled";
      return { ok: true, value: { name: r.value.name } };
    }, (v) => (cancelled ? "" : t().care.exported(v.name)));
  }

  /** floor care: move the board of room `from` to room `to` on this floor */
  transferBoard(from: number, to: number): Promise<boolean> {
    const target = this.care;
    if (target?.kind !== "floor") return Promise.resolve(false);
    return this.careAction(() => this.adapter.care.transfer(target.channelId, from, to), (v) => t().care.transferred(t().care.posts(v.posts)));
  }

  /** floor: rooms that are gone; building: floors that are gone (null: unknown floor) */
  removeOrphans(ids: (number | null)[]): Promise<boolean> {
    const target = this.care;
    if (!target || target.kind === "room" || !ids.length) return Promise.resolve(false);
    const run = target.kind === "floor" ? () => this.adapter.care.cleanFloor(target.channelId, ids.filter((id) => id !== null)) : () => this.adapter.care.cleanBuilding(ids);
    return this.careAction(run, (v) => t().care.removed(t().care.posts(v.posts)));
  }

  // ---------------------------------------------------------------- Key cabinet (ADR-0015)

  async openKeys(): Promise<void> {
    this.keysOpen = true;
    this.keys = null;
    this.keysError = null;
    await this.loadKeys();
  }

  closeKeys(): void {
    this.keysOpen = false;
    this.keys = null;
  }

  private async loadKeys(): Promise<void> {
    const r = await this.adapter.keys.list();
    if (!this.keysOpen && !this.maintenanceOpen) return;
    if (r.ok) this.keys = r.value;
    else this.keysError = r.error;
  }

  /** revoking this browser's key unpairs it: the connection reports "unpaired" */
  async revokeKey(id: string): Promise<boolean> {
    this.keysBusy = true;
    this.keysError = null;
    const r = await this.adapter.keys.revoke(id);
    this.keysBusy = false;
    if (!r.ok) {
      this.keysError = r.error;
      return false;
    }
    await this.loadKeys();
    return true;
  }

  // ---------------------------------------------------------------- Building overview (ADR-0019)

  openOverview(): void {
    this.overviewOpen = true;
  }

  closeOverview(): void {
    this.overviewOpen = false;
  }

  /** from the overview: go to a channel (a person's place or a room) and show that floor once Mumble confirms */
  visit(channelId: number): void {
    this.overviewOpen = false;
    this.goHome();
    void this.join(channelId);
  }

  /** from the overview: look at a floor without moving */
  viewFloor(floor: Floor): void {
    this.overviewOpen = false;
    this.showFloor(floor);
  }

  // ---------------------------------------------------------------- Status (B, ADR-0018)

  async openStatus(): Promise<void> {
    this.statusOpen = true;
    this.status = null;
    this.statusError = null;
    const r = await this.adapter.status.load();
    if (!this.statusOpen) return;
    if (r.ok) this.status = r.value;
    else this.statusError = r.error;
  }

  closeStatus(): void {
    this.statusOpen = false;
    this.status = null;
  }

  /** set (`text`, expiry after `minutes`, null: never) or clear (`text` null); the dialog closes on success */
  async saveStatus(text: string | null, minutes: number | null = null): Promise<boolean> {
    this.statusBusy = true;
    this.statusError = null;
    const r = text === null ? await this.adapter.status.clear() : await this.adapter.status.set(text, minutes);
    this.statusBusy = false;
    if (!r.ok) {
      this.statusError = r.error;
      return false;
    }
    this.closeStatus();
    return true;
  }

  // ---------------------------------------------------------------- Building maintenance (ADR-0016)

  /** settings and, in the same dialog, the keys of all users */
  async openMaintenance(): Promise<void> {
    this.maintenanceOpen = true;
    this.maintenance = null;
    this.maintenanceMessage = null;
    this.maintenanceError = null;
    this.keys = null;
    this.keysError = null;
    const [r] = await Promise.all([this.adapter.maintenance.load(), this.loadKeys()]);
    if (!this.maintenanceOpen) return;
    if (r.ok) this.maintenance = r.value;
    else this.maintenanceError = r.error;
  }

  closeMaintenance(): void {
    this.maintenanceOpen = false;
    this.maintenance = null;
    this.keys = null;
  }

  async saveSettings(settings: BuildingSettings): Promise<boolean> {
    this.maintenanceBusy = true;
    this.maintenanceMessage = null;
    this.maintenanceError = null;
    const r = await this.adapter.maintenance.save(settings);
    this.maintenanceBusy = false;
    if (!r.ok) {
      this.maintenanceError = r.error;
      return false;
    }
    this.maintenance = r.value;
    this.maintenanceMessage = t().maintenance.saved;
    if (this.board) void this.loadBoard(); // the largest attachment may have changed
    return true;
  }

  dismissNotice(): void {
    this.notice = null;
  }

  private report(result: CommandResult, channelId?: number): void {
    if (result === "ok" || result === "superseded") return;
    const name = this.snapshot?.channels.find((c) => c.id === channelId)?.name;
    this.setNotice(
      result === "offline"
        ? { text: t().common.mumbleOffline }
        : { text: name ? t().notices.joinFailed(name) : t().notices.actionFailed },
    );
  }

  private setNotice(notice: Notice): void {
    this.notice = notice;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice = null), 5000);
  }

  private onSnapshot(s: Snapshot): void {
    this.snapshot = s;
    // room changed: the sidebar always shows the board of the current room; closed, the toggle counts its unseen posts
    const channel = s.users.find((u) => u.session === s.self?.session)?.channel ?? null;
    if (channel !== this.boardChannel) void this.loadBoard();
    // The talking state is reported by the own client (only for what is audible, ADR-0005), which also ends it
    // with “passive”. Do not filter by the snapshot: the client hears new users earlier than polling shows them.
    // Only those who left the server are removed, and everything when self-deafened.
    const me = s.users.find((u) => u.session === s.self?.session);
    const present = new Set(s.users.map((u) => u.session));
    const next: Record<number, boolean> = {};
    if (!me?.selfDeaf) for (const [session, on] of Object.entries(this.talking)) if (on && present.has(Number(session))) next[Number(session)] = true;
    this.talking = next;
  }

  private onTalking(session: number, state: TalkingState): void {
    this.talking = { ...this.talking, [session]: state !== "passive" };
  }
}

/** hand a file to the browser to save */
/** the File System Access API's save dialog (Chromium); not in TypeScript's DOM types */
type SavePicker = (options: { suggestedName: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>;

/**
 * Save a streamed file. Where the browser has a "Save as" dialog (Chromium), it asks for the place and writes the
 * stream straight to disk: nothing is held in memory, and an installed web app shows no download bubble at its window
 * edge. Elsewhere, or if the dialog is not allowed (e.g. the click was too long ago), the browser's own download.
 */
async function saveStream(stream: ReadableStream<Uint8Array>, name: string): Promise<"saved" | "cancelled" | "failed"> {
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (picker) {
    let handle: FileSystemFileHandle | null = null;
    try {
      handle = await picker({ suggestedName: name, ...(name.endsWith(".zip") ? { types: [{ description: "ZIP", accept: { "application/zip": [".zip"] } }] } : {}) });
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        await stream.cancel().catch(() => {});
        return "cancelled";
      }
      // no permission for the dialog: fall back to the download below
    }
    if (handle) {
      try {
        await stream.pipeTo(await handle.createWritable()); // an error aborts the file instead of leaving half of it
        return "saved";
      } catch {
        return "failed";
      }
    }
  }
  try {
    saveFile(await new Response(stream).blob(), name);
    return "saved";
  } catch {
    return "failed";
  }
}

function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function wrap<K extends CareView["kind"]>(kind: K, r: BoardResult<Extract<CareView, { kind: K }>["value"]>): BoardResult<CareView> {
  return r.ok ? { ok: true, value: { kind, value: r.value } as CareView } : r;
}

function readSeen(): Record<string, number> {
  try {
    return parseSeen(localStorage.getItem(SEEN_KEY));
  } catch {
    return {};
  }
}
