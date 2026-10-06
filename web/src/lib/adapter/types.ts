/**
 * Interface between web UI and Mumble (ADR-0007).
 * Implementations: MockAdapter (fixtures, simulated Mumble) and LiveAdapter (WebSocket and REST to the service).
 */
import type { Attachment, BoardErrorCode as ServerBoardError, BoardView, BuildingCare, BuildingSettings, CareDone, FloorCare, KeyCabinet, Maintenance, RoomCare, CommandBody, CommandResult, NewPost, PairErrorCode as ServerPairError, Pinned, Post, PostUpdate, ReactionKind, Snapshot, StatusView, TalkingState, Uploaded, Versions } from "@ruumble/protocol";

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
  /** copy a post of the own room to another room the user may enter */
  copy(id: string, channelId: number): Promise<BoardResult<Post>>;
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

/** Care of the stored data (ADR-0014): only with Mumble's Write permission on the room, floor or root channel */
export interface CareApi {
  room(channelId: number): Promise<BoardResult<RoomCare>>;
  /** delete every post of the room's board */
  clearRoom(channelId: number): Promise<BoardResult<CareDone>>;
  /** delete the posts older than `days` (one of PRUNE_DAYS) */
  pruneRoom(channelId: number, days: number): Promise<BoardResult<CareDone>>;
  /** the whole board as a file to save (ZIP with board.md and the attachments) */
  /** the board as a file, streamed: resolves once the service answers, the content follows in `stream` */
  exportRoom(channelId: number): Promise<BoardResult<{ stream: ReadableStream<Uint8Array>; name: string }>>;
  floor(channelId: number): Promise<BoardResult<FloorCare>>;
  /** remove these rooms that are gone from the floor, with all their data */
  cleanFloor(channelId: number, rooms: number[]): Promise<BoardResult<CareDone>>;
  /** move the board of room `from` (anywhere) to room `to` on this floor */
  transfer(channelId: number, from: number, to: number): Promise<BoardResult<CareDone>>;
  building(): Promise<BoardResult<BuildingCare>>;
  /** remove these floors that are gone, with all their data (null: rooms of an unknown floor) */
  cleanBuilding(floors: (number | null)[]): Promise<BoardResult<CareDone>>;
  /** forget the learned ticket links of these projects (building-wide) */
  forgetTickets(projects: string[]): Promise<BoardResult<true>>;
}

/** Key cabinet (ADR-0015): the paired browsers, the own ones for everyone and everyone's for admins */
export interface KeysApi {
  list(): Promise<BoardResult<KeyCabinet>>;
  /** revoking the own browser's key unpairs it */
  revoke(id: string): Promise<BoardResult<true>>;
}

/** Building maintenance (ADR-0016): the settings admins change, the environment variables are the defaults */
export interface MaintenanceApi {
  load(): Promise<BoardResult<Maintenance>>;
  save(settings: BuildingSettings): Promise<BoardResult<Maintenance>>;
}

/** The own status (B, ADR-0018): shown to everyone at the avatar, expires after `minutes` (null: never) */
export interface StatusApi {
  load(): Promise<BoardResult<StatusView>>;
  set(text: string, minutes: number | null): Promise<BoardResult<StatusView>>;
  clear(): Promise<BoardResult<StatusView>>;
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
  /** someone in the room nudged the own (deafened) user (ADR-0020) */
  nudge(session: number, name: string): void;
  connection(state: ConnectionState): void;
}

export interface MumbleAdapter {
  start(events: AdapterEvents): void;
  stop(): void;
  /** Runs a command in the own Mumble client. The result only arrives after confirmation (ADR-0003). */
  command(body: CommandBody): Promise<CommandResult>;
  board: BoardApi;
  care: CareApi;
  keys: KeysApi;
  maintenance: MaintenanceApi;
  status: StatusApi;
  /** get the attention of a deafened person in the own room (ADR-0020); once a minute per person */
  nudge(session: number): Promise<BoardResult<true>>;
  pairing: PairApi;
  /** versions of service and offered plugin (notice pages); null if unknown */
  versions(): Promise<Versions | null>;
  /** optional: custom address for avatar images (mock), otherwise /avatar/<id>?v=<version> */
  avatarUrl?(userId: number, version: string): string;
}
