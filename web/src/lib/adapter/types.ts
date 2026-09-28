/**
 * Schnittstelle zwischen Oberfläche und Mumble (ADR-0007).
 * Umsetzungen: MockAdapter (Fixtures, simuliertes Mumble) und später LiveAdapter (WebSocket zum Dienst, AP7).
 */
import type { CommandBody, CommandResult, Snapshot, TalkingState } from "@ruumble/protocol";

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
  connection(state: ConnectionState): void;
}

export interface MumbleAdapter {
  start(events: AdapterEvents): void;
  stop(): void;
  /** Führt einen Befehl im eigenen Mumble-Client aus. Das Ergebnis kommt erst nach Bestätigung (ADR-0003). */
  command(body: CommandBody): Promise<CommandResult>;
}
