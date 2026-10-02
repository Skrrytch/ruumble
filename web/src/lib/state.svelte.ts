/**
 * State of the web UI: holds the latest snapshot, derives the building and runs commands.
 * No optimistic switching: the own channel only changes with the next snapshot (ADR-0003).
 */
import { BOARD_LIMITS, type Attachment, type BoardView, type CommandResult, type PostKind, type Post, type ReactionKind, type Snapshot, type TalkingState, type Uploaded, type Versions } from "@ruumble/protocol";
import type { BoardErrorCode, BoardResult, ConnectionState, MumbleAdapter, PairErrorCode, PluginStatus } from "./adapter/types.ts";
import { formatSize, newestPost, parseSeen, unseenPosts, type BoardFilter } from "./board/model.ts";
import { t } from "./i18n/index.svelte.ts";
import { avatarUrlOf, buildBuilding, homeFloor, type Building, type Floor } from "./model/building.ts";

export type Notice = { text: string };

/** Plain text for a board error in the web UI's language */
export function boardErrorText(error: BoardErrorCode): string {
  const m = t().boardErrors[error];
  return typeof m === "function" ? m(formatSize(BOARD_LIMITS.fileBytes)) : m;
}

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
  private boardChannel: number | null = null;
  private boardSeen = readSeen();

  /** displayed floor; `null` = own or first displayable one */
  private viewFloorId = $state<number | null>(null);

  building: Building | null = $derived.by(() => {
    if (!this.snapshot) return null;
    const custom = this.adapter.avatarUrl?.bind(this.adapter); // mock: own images, otherwise /avatar/<id>
    return buildBuilding(this.snapshot, custom ? { avatarUrl: custom } : {});
  });

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
      connection: (state) => (this.connection = state),
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
    this.setNotice({ text: boardErrorText(error) });
    return false;
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

function readSeen(): Record<string, number> {
  try {
    return parseSeen(localStorage.getItem(SEEN_KEY));
  } catch {
    return {};
  }
}
