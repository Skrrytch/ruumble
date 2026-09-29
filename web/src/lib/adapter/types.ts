/**
 * Interface between web UI and Mumble (ADR-0007).
 * Implementations: MockAdapter (fixtures, simulated Mumble) and LiveAdapter (WebSocket and REST to the service).
 */
import type { Attachment, BoardErrorCode as ServerBoardError, BoardView, CommandBody, CommandResult, NewPost, Post, PostUpdate, Snapshot, TalkingState, Uploaded, Versions } from "@ruumble/protocol";

export type BoardErrorCode = ServerBoardError | "offline";
export type BoardResult<T> = { ok: true; value: T } | { ok: false; error: BoardErrorCode };

/** Board of the room the own user is currently in (ADR-0011) */
export interface BoardApi {
  load(): Promise<BoardResult<BoardView>>;
  create(post: NewPost): Promise<BoardResult<Post>>;
  update(id: string, change: PostUpdate): Promise<BoardResult<Post>>;
  remove(id: string): Promise<BoardResult<true>>;
  /** Upload an attachment (image or file, at most `BOARD_LIMITS.fileBytes`); `onProgress` with 0…1 */
  upload(file: Blob, name: string, onProgress?: (fraction: number) => void): Promise<BoardResult<Uploaded>>;
  /** Address of an attachment; `download`: always save as a file */
  fileUrl(attachment: Attachment, download?: boolean): string;
}

export type PluginStatus = "connected" | "disconnected";

/** Connection of the web UI to the service (LiveAdapter only) */
export type ConnectionState = "connected" | "reconnecting" | "unpaired";

export interface AdapterEvents {
  /** complete new state, after every change */
  snapshot(snapshot: Snapshot): void;
  /** talking state of a user the own client hears (ADR-0005) */
  talking(session: number, state: TalkingState): void;
  /** `preview`: the service shows the building read-only without pairing. */
  status(plugin: PluginStatus, preview: boolean): void;
  /** Something changed on this room's board (only for those present) */
  board(channelId: number): void;
  connection(state: ConnectionState): void;
}

export interface MumbleAdapter {
  start(events: AdapterEvents): void;
  stop(): void;
  /** Runs a command in the own Mumble client. The result only arrives after confirmation (ADR-0003). */
  command(body: CommandBody): Promise<CommandResult>;
  board: BoardApi;
  /** versions of service and offered plugin (notice pages); null if unknown */
  versions(): Promise<Versions | null>;
  /** optional: custom address for avatar images (mock), otherwise /avatar/<id>?v=<version> */
  avatarUrl?(userId: number, version: string): string;
}
