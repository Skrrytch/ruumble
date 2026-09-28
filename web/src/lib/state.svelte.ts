/**
 * Zustand der Oberfläche: hält den letzten Snapshot, leitet das Gebäude ab und führt Befehle aus.
 * Kein optimistisches Umschalten: Der eigene Kanal ändert sich erst mit dem nächsten Snapshot (ADR-0003).
 */
import { BOARD_LIMITS, type Attachment, type BoardView, type CommandResult, type PostKind, type Snapshot, type TalkingState, type Uploaded } from "@ruumble/protocol";
import type { BoardErrorCode, BoardResult, ConnectionState, MumbleAdapter, PluginStatus } from "./adapter/types.ts";
import { formatSize, type BoardFilter } from "./board/model.ts";
import { avatarUrlOf, buildBuilding, homeFloor, type Building, type Floor } from "./model/building.ts";

export type Notice = { text: string };

const BOARD_ERRORS: Record<BoardErrorCode, string> = {
  "not-paired": "Mumble ist nicht verbunden.",
  "not-in-room": "Du bist nicht mehr in diesem Raum.",
  "no-board-here": "Pinnwände gibt es nur in Räumen.",
  "not-found": "Der Beitrag existiert nicht mehr.",
  forbidden: "Das darfst du nicht.",
  "too-large": `Die Datei ist zu groß (höchstens ${formatSize(BOARD_LIMITS.fileBytes)}).`,
  "bad-type": "Das ist kein Bild, das Ruumble anzeigen kann (PNG, JPEG, GIF, WebP).",
  invalid: "Der Beitrag ist leer oder ungültig.",
  "rate-limited": "Zu viele Beiträge in kurzer Zeit – bitte kurz warten.",
  offline: "Keine Verbindung zum Ruumble-Dienst.",
};

export class RuumbleState {
  snapshot = $state<Snapshot | null>(null);
  plugin = $state<PluginStatus>("disconnected");
  /** nur lesend, ohne eigenen Nutzer (Vorschau des Dienstes) */
  preview = $state(false);
  connection = $state<ConnectionState>("connected");
  /** Session → spricht gerade (nur was der eigene Client hört) */
  talking = $state<Record<number, boolean>>({});
  /** laufender Kanalwechsel (Übergangszustand) */
  pendingChannel = $state<number | null>(null);
  notice = $state<Notice | null>(null);
  /** Seitenleiste der Pinnwand: zu Beginn ausgeblendet, Schalter ist die Grafik im eigenen Raum (ADR-0011) */
  boardOpen = $state(false);
  board = $state<BoardView | null>(null);
  boardError = $state<BoardErrorCode | null>(null);
  boardFilter = $state<BoardFilter>("all");
  private boardChannel: number | null = null;

  /** angezeigte Etage; `null` = eigene bzw. erste darstellbare */
  private viewFloorId = $state<number | null>(null);

  building: Building | null = $derived.by(() => {
    if (!this.snapshot) return null;
    const custom = this.adapter.avatarUrl?.bind(this.adapter); // Mock: eigene Bilder, sonst /avatar/<id>
    return buildBuilding(this.snapshot, custom ? { avatarUrl: custom } : {});
  });

  /** Avatarbild eines gerade verbundenen Nutzers (Benutzerbereich, Pinnwand); sonst `null` → Initialen */
  avatarOf(name: string): string | null {
    const u = this.snapshot?.users.find((x) => x.name === name);
    if (!u) return null;
    const custom = this.adapter.avatarUrl?.bind(this.adapter);
    return custom ? avatarUrlOf(u, custom) : avatarUrlOf(u);
  }

  /** angezeigte Etage */
  floor: Floor | null = $derived.by(() => {
    const b = this.building;
    if (!b) return null;
    return b.floors.find((f) => f.channelId === this.viewFloorId && (!f.lock || f.isSelf)) ?? homeFloor(b);
  });

  /** Ohne eigenen Nutzer ist alles nur lesbar. */
  readonly = $derived(!this.snapshot?.self);

  me = $derived(this.snapshot?.users.find((u) => u.session === this.snapshot?.self?.session) ?? null);

  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly adapter: MumbleAdapter) {}

  start(): void {
    this.adapter.start({
      snapshot: (s) => this.onSnapshot(s),
      talking: (session, state) => this.onTalking(session, state),
      status: (plugin, preview) => {
        this.plugin = plugin;
        this.preview = preview;
        this.connection = "connected";
      },
      connection: (state) => (this.connection = state),
      board: (channelId) => {
        if (this.boardOpen && this.me?.channel === channelId) void this.loadBoard();
      },
    });
  }

  stop(): void {
    this.adapter.stop();
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

  /** Mikrofon-Knopf: gedrückt = stumm oder taub; Klick schaltet den Zielzustand (Mumble löst Taub dabei mit auf). */
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

  // ---------------------------------------------------------------- Pinnwand

  toggleBoard(): void {
    this.boardOpen = !this.boardOpen;
    if (this.boardOpen) void this.loadBoard();
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
    } else {
      this.board = null;
      this.boardError = r.error;
    }
  }

  /** Beitrag anheften; `true` bei Erfolg (die Eingabe wird dann geleert) */
  async pin(kind: PostKind, text: string, language?: string): Promise<boolean> {
    const r = await this.adapter.board.create({ kind, text, ...(language ? { language } : {}) });
    if (!r.ok) return this.boardFailed(r.error);
    await this.loadBoard();
    return true;
  }

  /** Anhang hochladen; die Eingabe zeigt den Fortschritt und heftet ihn danach mit `pinAttachment` an */
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

  /** Klartext zu einem Fehler der Pinnwand (für Hinweise direkt an der Eingabe) */
  boardErrorText(error: BoardErrorCode): string {
    return BOARD_ERRORS[error];
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

  private boardFailed(error: BoardErrorCode): false {
    this.setNotice({ text: BOARD_ERRORS[error] });
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
        ? { text: "Mumble ist nicht verbunden." }
        : { text: name ? `Wechsel nach „${name}“ nicht möglich.` : "Aktion nicht möglich." },
    );
  }

  private setNotice(notice: Notice): void {
    this.notice = notice;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice = null), 5000);
  }

  private onSnapshot(s: Snapshot): void {
    this.snapshot = s;
    // Raum gewechselt: Die Seitenleiste zeigt immer die Pinnwand des aktuellen Raums
    const channel = s.users.find((u) => u.session === s.self?.session)?.channel ?? null;
    if (this.boardOpen && channel !== this.boardChannel) void this.loadBoard();
    // Den Sprechzustand meldet der eigene Client (nur für Hörbares, ADR-0005) und beendet ihn selbst mit
    // „passive“. Nicht am Snapshot filtern: Der Client hört neue Nutzer früher, als das Polling sie zeigt.
    // Entfernt wird nur, wer den Server verlassen hat, und alles bei eigenem Taub.
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
