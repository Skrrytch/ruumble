/**
 * Zustand der Oberfläche: hält den letzten Snapshot, leitet das Gebäude ab und führt Befehle aus.
 * Kein optimistisches Umschalten: Der eigene Kanal ändert sich erst mit dem nächsten Snapshot (ADR-0003).
 */
import type { CommandResult, Snapshot, TalkingState } from "@ruumble/protocol";
import type { ConnectionState, MumbleAdapter, PluginStatus } from "./adapter/types.ts";
import { buildBuilding, homeFloor, type Building, type Floor } from "./model/building.ts";

export type Notice = { kind: "join-failed" | "offline"; text: string };

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
  /** angezeigte Etage; `null` = eigene bzw. erste darstellbare */
  private viewFloorId = $state<number | null>(null);

  building: Building | null = $derived(this.snapshot ? buildBuilding(this.snapshot) : null);

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

  dismissNotice(): void {
    this.notice = null;
  }

  private report(result: CommandResult, channelId?: number): void {
    if (result === "ok" || result === "superseded") return;
    const name = this.snapshot?.channels.find((c) => c.id === channelId)?.name;
    this.setNotice(
      result === "offline"
        ? { kind: "offline", text: "Mumble ist nicht verbunden." }
        : { kind: "join-failed", text: name ? `Wechsel nach „${name}“ nicht möglich.` : "Aktion nicht möglich." },
    );
  }

  private setNotice(notice: Notice): void {
    this.notice = notice;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice = null), 5000);
  }

  private onSnapshot(s: Snapshot): void {
    this.snapshot = s;
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
