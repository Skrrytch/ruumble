/**
 * Schnittstelle zwischen Oberfläche und Mumble (ADR-0007).
 * Umsetzungen: MockAdapter (Fixtures, simuliertes Mumble) und später LiveAdapter (WebSocket zum Dienst, AP7).
 */
import type { Attachment, BoardErrorCode as ServerBoardError, BoardView, CommandBody, CommandResult, NewPost, Post, PostUpdate, Snapshot, TalkingState, Uploaded } from "@ruumble/protocol";

export type BoardErrorCode = ServerBoardError | "offline";
export type BoardResult<T> = { ok: true; value: T } | { ok: false; error: BoardErrorCode };

/** Pinnwand des Raums, in dem der eigene Nutzer gerade ist (ADR-0011) */
export interface BoardApi {
  load(): Promise<BoardResult<BoardView>>;
  create(post: NewPost): Promise<BoardResult<Post>>;
  update(id: string, change: PostUpdate): Promise<BoardResult<Post>>;
  remove(id: string): Promise<BoardResult<true>>;
  /** Anhang hochladen (Bild oder Datei, bis 10 MB); `onProgress` mit 0…1 */
  upload(file: Blob, name: string, onProgress?: (fraction: number) => void): Promise<BoardResult<Uploaded>>;
  /** Adresse eines Anhangs; `download`: immer als Datei speichern */
  fileUrl(attachment: Attachment, download?: boolean): string;
}

export type PluginStatus = "connected" | "disconnected";

/** Verbindung der Oberfläche zum Dienst (nur LiveAdapter) */
export type ConnectionState = "connected" | "reconnecting" | "unpaired";

export interface AdapterEvents {
  /** vollständiger neuer Stand, nach jeder Änderung */
  snapshot(snapshot: Snapshot): void;
  /** Sprechzustand eines Nutzers, den der eigene Client hört (ADR-0005) */
  talking(session: number, state: TalkingState): void;
  /** `preview`: Der Dienst zeigt das Gebäude ohne Kopplung nur lesend. */
  status(plugin: PluginStatus, preview: boolean): void;
  /** An der Pinnwand dieses Raums hat sich etwas geändert (nur für Anwesende) */
  board(channelId: number): void;
  connection(state: ConnectionState): void;
}

export interface MumbleAdapter {
  start(events: AdapterEvents): void;
  stop(): void;
  /** Führt einen Befehl im eigenen Mumble-Client aus. Das Ergebnis kommt erst nach Bestätigung (ADR-0003). */
  command(body: CommandBody): Promise<CommandResult>;
  board: BoardApi;
  /** optional: eigene Adresse für Avatarbilder (Mock), sonst /avatar/<id>?v=<version> */
  avatarUrl?(userId: number, version: string): string;
}
