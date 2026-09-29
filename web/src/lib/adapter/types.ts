/**
 * Interface between web UI and Mumble (ADR-0007).
 * Implementations: MockAdapter (fixtures, simulated Mumble) and LiveAdapter (WebSocket and REST to the service).
 */
import type { Attachment, BoardErrorCode as ServerBoardError, BoardView, CommandBody, CommandResult, NewPost, PairErrorCode as ServerPairError, Pinned, Post, PostUpdate, ReactionKind, Snapshot, TalkingState, Uploaded, Versions } from "@ruumble/protocol";

export type BoardErrorCode = ServerBoardError | "offline";
export type BoardResult<T> = { ok: true; value: T } | { ok: false; error: BoardErrorCode };

export type PairErrorCode = ServerPairError | "offline";
export type PairResult<T> = { ok: true; value: T } | { ok: false; error: PairErrorCode };

/** Pairing this browser with a code from the Mumble log (ADR-0012) */
export interface PairApi {
  /** the service sends a code to the Mumble log of the plugins at this browser's address; returns the request ID */
  request(): Promise<PairResult<string>>;
  /** success: the browser is paired and the adapter connects again */
  confirm(request: string, code: string): Promise<PairResult<true>>;
}

/** Board of the room the own user is currently in (ADR-0011) */
export interface BoardApi {
  load(): Promise<BoardResult<BoardView>>;
  create(post: NewPost): Promise<BoardResult<Post>>;
  update(id: string, change: PostUpdate): Promise<BoardResult<Post>>;
  remove(id: string): Promise<BoardResult<true>>;
  /** keep a post of the room on top, replacing the previous one (A3) */
  pin(postId: string, title: string): Promise<BoardResult<Pinned>>;
  unpin(): Promise<BoardResult<true>>;
  /** tick or untick task `index` of a task list (A2) */
  toggleTask(id: string, index: number, done: boolean): Promise<BoardResult<Post>>;
  /** set (`on`) or take back a quick reaction (A1) */
  react(id: string, kind: ReactionKind, on: boolean): Promise<BoardResult<Post>>;
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
  pairing: PairApi;
  /** versions of service and offered plugin (notice pages); null if unknown */
  versions(): Promise<Versions | null>;
  /** optional: custom address for avatar images (mock), otherwise /avatar/<id>?v=<version> */
  avatarUrl?(userId: number, version: string): string;
}
