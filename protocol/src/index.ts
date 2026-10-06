/**
 * Ruumble protocol, version 1 (ADR-0007).
 *
 * JSON over WebSocket, every message has the form `{ v: 1, type, ... }`.
 * Service endpoints: `/ws/plugin` (plugin ↔ service) and `/ws/ui` (web UI ↔ service).
 *
 * The service delivers raw Mumble data. The building is only derived in the web UI.
 */
import { z } from "zod";

export * from "./tasks.ts";
export * from "./tickets.ts";

export const PROTOCOL_VERSION = 1 as const;

const v = z.literal(PROTOCOL_VERSION);
const channelId = z.number().int().min(0);
const session = z.number().int().min(1);

// ---------------------------------------------------------------- Raw Mumble data

/** Channel as delivered by Ice. The root channel has `id 0` and `parent null` (in Ice: -1). */
export const Channel = z.object({
  id: channelId,
  parent: channelId.nullable(),
  name: z.string(),
  position: z.number().int(),
  /** Directly linked channels, symmetric (S1). */
  links: z.array(channelId),
  temporary: z.boolean(),
  /** description as maintained in Mumble: Qt rich text (HTML), sanitised by the web UI; missing or empty: none */
  description: z.string().optional(),
});
export type Channel = z.infer<typeof Channel>;

/** limits of the status (B): length of the text, longest expiry in minutes, how many recent texts are kept */
export const STATUS_LIMITS = { textChars: 80, maxMinutes: 7 * 24 * 60, recent: 5 } as const;
/** expiry choices in the status dialog, in minutes; null: the status stays until it is cleared */
export const STATUS_DURATIONS = [30, 60, 120, 240, 480, null] as const;
/** a new status expires after this by default */
export const STATUS_DEFAULT_MINUTES = 120;

/** a person's status (B): free text set in Ruumble, kept by the service, shown to everyone; `until` null: no expiry */
export const UserStatus = z.object({ text: z.string().min(1).max(STATUS_LIMITS.textChars), until: z.number().int().nullable() });
export type UserStatus = z.infer<typeof UserStatus>;

export const User = z.object({
  session,
  name: z.string(),
  channel: channelId,
  selfMute: z.boolean(),
  selfDeaf: z.boolean(),
  /** set by the server or an admin */
  mute: z.boolean(),
  deaf: z.boolean(),
  suppress: z.boolean(),
  /** registered user ID, `null` for unregistered users (AP9) */
  userId: z.number().int().min(0).nullable(),
  /** version of the avatar image (hash), `null` without avatar; image at /avatar/<userId>?v=<avatar> (AP9) */
  avatar: z.string().regex(/^[0-9a-f]{16}$/).nullable(),
  /** whole minutes since last talking (Ice idlesecs counts only talking, AP10) */
  idleMinutes: z.number().int().min(0),
  /** currently recording (AP10) */
  recording: z.boolean(),
  /** status set in Ruumble (B), only while the person's plugin is connected; missing: none */
  status: UserStatus.optional(),
  /** uses Ruumble: the person's plugin is connected to this service; missing: no */
  ruumble: z.boolean().optional(),
});
export type User = z.infer<typeof User>;

/** Mumble_TalkingState without INVALID; `talking-muted` = talking, but locally muted. */
export const TalkingState = z.enum(["passive", "talking", "whispering", "shouting", "talking-muted"]);
export type TalkingState = z.infer<typeof TalkingState>;

/** Key of a JSON object that maps a channel ID. */
const channelKey = z.string().regex(/^\d+$/);

// ---------------------------------------------------------------- Commands

export const CommandBody = z.discriminatedUnion("cmd", [
  z.object({ cmd: z.literal("join"), channel: channelId }),
  z.object({ cmd: z.literal("mute"), on: z.boolean() }),
  z.object({ cmd: z.literal("deaf"), on: z.boolean() }),
]);
export type CommandBody = z.infer<typeof CommandBody>;

export const CommandResult = z.enum(["ok", "rejected", "superseded", "timeout", "offline"]);
export type CommandResult = z.infer<typeof CommandResult>;

const commandId = z.string().min(1).max(64);

// ---------------------------------------------------------------- Plugin → service

/** languages of the web UI and notices: German, otherwise English */
export const Locale = z.enum(["de", "en"]);
export type Locale = z.infer<typeof Locale>;

export const PluginHello = z.object({
  v,
  type: z.literal("hello"),
  session,
  /** SHA1 hex of the client certificate (getUserHash), stable key of the pairing (ADR-0004) */
  certHash: z.string().regex(/^[0-9a-f]{40}$/),
  pluginVersion: z.string(),
  /** The plugin has paired with this service before (`pairedWith` in plugin.json, ADR-0010) */
  paired: z.boolean(),
  /** version of the Mumble client (mumble_setMumbleInfo), from plugin 0.4; for operations and compatibility */
  mumbleVersion: z.string().max(32).optional(),
  /** user's language from the system environment (from plugin 0.4); if missing, German applies (older plugins) */
  locale: Locale.optional(),
});

export const PluginResult = z.object({ v, type: z.literal("result"), id: commandId, result: CommandResult });
export const PluginSelfState = z.object({ v, type: z.literal("selfState"), selfMute: z.boolean(), selfDeaf: z.boolean() });
export const PluginTalking = z.object({ v, type: z.literal("talking"), session, state: TalkingState });
export const PluginBye = z.object({ v, type: z.literal("bye") });

export const PluginToBridge = z.discriminatedUnion("type", [PluginHello, PluginResult, PluginSelfState, PluginTalking, PluginBye]);
export type PluginToBridge = z.infer<typeof PluginToBridge>;

// ---------------------------------------------------------------- Service → plugin

/** `already-connected`: a plugin of the same user is connected from another address (ADR-0017) */
export const RejectReason = z.enum(["unknown-session", "hash-mismatch", "address-mismatch", "no-certificate", "already-connected"]);

export const BridgeWelcome = z.object({ v, type: z.literal("welcome"), pairUrl: z.url().optional() });
export const BridgeReject = z.object({ v, type: z.literal("reject"), reason: RejectReason });
export const BridgeCommand = z.object({ v, type: z.literal("command"), id: commandId, body: CommandBody });

/** Short notice for the Mumble log (board, AP11.4). Plain text, Mumble escapes HTML itself. */
export const BridgeNotify = z.object({ v, type: z.literal("notify"), text: z.string().min(1).max(300) });
export const BridgeToPlugin = z.discriminatedUnion("type", [BridgeWelcome, BridgeReject, BridgeCommand, BridgeNotify]);
export type BridgeToPlugin = z.infer<typeof BridgeToPlugin>;

// ---------------------------------------------------------------- Web UI → service

export const UiCommand = z.object({ v, type: z.literal("command"), id: commandId, body: CommandBody });

export const UiToBridge = z.discriminatedUnion("type", [UiCommand]);
export type UiToBridge = z.infer<typeof UiToBridge>;

// ---------------------------------------------------------------- Service → web UI

export const Snapshot = z.object({
  v,
  type: z.literal("snapshot"),
  server: z.object({
    /** registername, fallback "Root" (like the Mumble client) */
    name: z.string(),
    version: z.string(),
  }),
  /** own user. `null` as long as no paired plugin is connected. */
  self: z.object({ session }).nullable(),
  channels: z.array(Channel),
  users: z.array(User),
  /** channel ID → sessions listening there */
  listeners: z.record(channelKey, z.array(session)),
  /** channel ID → may the own user enter the channel (PermissionEnter). A missing channel means `true`. */
  canEnter: z.record(channelKey, z.boolean()),
  /**
   * Channels whose stored data the own user may tend (Mumble Write permission, ADR-0014): rooms, floors and the
   * root channel (0) for the whole building. Missing: none.
   */
  care: z.array(channelId).optional(),
});
export type Snapshot = z.infer<typeof Snapshot>;

// ---------------------------------------------------------------- Board (ADR-0011, REST under /api/board)

/** board limits (ADR-0011) */
export const BOARD_LIMITS = { fileBytes: 10 * 1024 * 1024, textChars: 100_000 } as const;

/** image types the board shows as images (the service detects them from the bytes); never SVG (ADR-0011) */
export const BOARD_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

export const PostKind = z.enum(["text", "code", "image", "file"]);
export type PostKind = z.infer<typeof PostKind>;

export const Attachment = z.object({
  /** SHA-256 hex of the content; fetched at /api/board/files/<id> */
  id: z.string().regex(/^[0-9a-f]{64}$/),
  name: z.string().max(255),
  mime: z.string(),
  size: z.number().int().min(0),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
});
export type Attachment = z.infer<typeof Attachment>;

/** response to POST /api/board/uploads: `image` = recognised as an image (from the bytes, never SVG) */
export const Uploaded = Attachment.extend({ image: z.boolean() });
export type Uploaded = z.infer<typeof Uploaded>;

/** Quick reactions with a fixed meaning (A1), in display order: work first, then social */
export const REACTION_KINDS = [
  "agree", "disagree", "looking", "thinking", "wait", "done", "broken", "unclear", "important", "idea", "release", "deal",
  "happy", "sad", "applause", "congrats", "birthday", "break", "cheers",
] as const;
export const ReactionKind = z.enum(REACTION_KINDS);
export type ReactionKind = z.infer<typeof ReactionKind>;
/** one kind on one post: who reacted (names at the time) and whether the own user is among them */
export const Reaction = z.object({ kind: ReactionKind, count: z.number().int().min(1), names: z.array(z.string()), mine: z.boolean() });
export type Reaction = z.infer<typeof Reaction>;

export const Post = z.object({
  id: z.string().min(1),
  channelId,
  kind: PostKind,
  /** Markdown (text), source code (code) or caption (image/file) – always raw text, never HTML */
  text: z.string().max(BOARD_LIMITS.textChars),
  /** language of the code (highlight.js), empty: detect automatically */
  language: z.string().max(40).optional(),
  attachment: Attachment.optional(),
  authorName: z.string(),
  /** written by the own user (may delete) */
  mine: z.boolean(),
  /** may the own user delete it (author or Mumble admin) */
  canDelete: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  updatedByName: z.string().optional(),
  /** a copy from another room: that room's name and the original author, both at the time of copying */
  copiedFrom: z.object({ roomName: z.string(), authorName: z.string() }).optional(),
  /** only kinds with at least one reaction, in the order of REACTION_KINDS */
  reactions: z.array(Reaction),
});
export type Post = z.infer<typeof Post>;

/** the post kept on top of a room's board (A3): at most one per room */
export const Pinned = z.object({ postId: z.string().min(1), title: z.string().min(1).max(40), pinnedByName: z.string(), pinnedAt: z.number().int() });
export type Pinned = z.infer<typeof Pinned>;
/** PUT /api/board/pin: keep a post of the room on top (replaces the previous one) */
export const PinRequest = z.object({ postId: z.string().min(1), title: z.string().trim().min(1).max(40) });
export type PinRequest = z.infer<typeof PinRequest>;

/** project key → base URL of its issues (tickets.ts) */
const TicketLinksSchema = z.record(z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/), z.url({ protocol: /^https?$/ }));

/** GET /api/board: board of the room the own user is currently in */
export const BoardView = z.object({
  channelId,
  channelName: z.string(),
  posts: z.array(Post),
  pinned: Pinned.nullable(),
  /** learned ticket links (tickets.ts), only for projects whose keys appear in this room's posts */
  tickets: TicketLinksSchema.optional(),
  /** largest attachment the service accepts (building maintenance, ADR-0016); missing: BOARD_LIMITS.fileBytes */
  maxFileBytes: z.number().int().min(1).optional(),
});
export type BoardView = z.infer<typeof BoardView>;

// ---------------------------------------------------------------- Care (ADR-0014, REST under /api/care)

const count = z.number().int().min(0);

/** "delete posts older than" in room care: 7 and 14 days, 1, 3 and 6 months (in days) */
export const PRUNE_DAYS = [7, 14, 30, 90, 180] as const;
const time = z.number().int();

/** GET /api/care/rooms/:id: what a room's board holds */
export const RoomCare = z.object({
  channelId,
  name: z.string(),
  posts: count,
  /** size of the attachments in bytes */
  bytes: count,
  /** creation time of the newest and the oldest post, null without posts */
  newest: time.nullable(),
  oldest: time.nullable(),
  /** posts are deleted automatically after this many days */
  retentionDays: z.number().int().min(1),
  /** per choice of PRUNE_DAYS: how many posts are older */
  olderThan: z.array(z.object({ days: z.number().int(), posts: count })),
});
export type RoomCare = z.infer<typeof RoomCare>;

/** board data of a room that is gone (deleted in Mumble, or no longer a room) */
export const OrphanedRoom = z.object({
  channelId,
  /** last known name */
  name: z.string(),
  posts: count,
  bytes: count,
  /** when the service found the channel missing; null: it still exists, but is no longer a room */
  goneSince: z.number().int().nullable(),
});
export type OrphanedRoom = z.infer<typeof OrphanedRoom>;

/** a room of the floor in the overview */
export const RoomSummary = z.object({ channelId, name: z.string(), posts: count, bytes: count, newest: time.nullable() });
export type RoomSummary = z.infer<typeof RoomSummary>;

/** a room whose board may be moved to this floor: any room in the database the user may tend */
export const TransferSource = z.object({
  channelId,
  name: z.string(),
  /** its floor (current, else last known); empty if not known */
  floorName: z.string(),
  posts: count,
  /** the room no longer exists as a room */
  gone: z.boolean(),
});
export type TransferSource = z.infer<typeof TransferSource>;

/** GET /api/care/floors/:id: the floor's rooms, rooms that are gone but still hold data, boards that can be moved here */
export const FloorCare = z.object({
  channelId,
  name: z.string(),
  /** data of deleted rooms is kept this many days after they were found missing (building maintenance) */
  graceDays: z.number().int().min(0),
  rooms: z.array(RoomSummary),
  orphans: z.array(OrphanedRoom),
  sources: z.array(TransferSource),
});
export type FloorCare = z.infer<typeof FloorCare>;

/** a floor that is gone, with the data of its rooms; `channelId` null: rooms whose floor is not known */
export const OrphanedFloor = z.object({
  channelId: channelId.nullable(),
  name: z.string(),
  rooms: z.number().int().min(1),
  posts: count,
  bytes: count,
  goneSince: z.number().int().nullable(),
});
export type OrphanedFloor = z.infer<typeof OrphanedFloor>;

/** a floor in the storage overview: rooms with posts, posts, attachment size */
export const FloorSummary = z.object({ channelId, name: z.string(), rooms: count, posts: count, bytes: count });
export type FloorSummary = z.infer<typeof FloorSummary>;

/**
 * GET /api/care/building: storage use, the floors, floors that are gone but still hold data, and every learned ticket
 * link (one per project, building-wide)
 */
export const BuildingCare = z.object({
  storage: z.object({ usedBytes: count, quotaBytes: count, retentionDays: z.number().int().min(1), graceDays: z.number().int().min(0) }),
  floors: z.array(FloorSummary),
  orphans: z.array(OrphanedFloor),
  tickets: TicketLinksSchema,
});
export type BuildingCare = z.infer<typeof BuildingCare>;

/** POST /api/care/floors/:id/cleanup: remove these rooms (as shown) with all their data */
export const FloorCleanup = z.object({ rooms: z.array(channelId).min(1).max(1000) });
/** POST /api/care/building/cleanup: remove these floors (as shown) with all their data */
export const BuildingCleanup = z.object({ floors: z.array(channelId.nullable()).min(1).max(1000) });

/** POST /api/care/rooms/:id/prune: delete the posts older than this many days */
export const RoomPrune = z.object({ days: z.union(PRUNE_DAYS.map((d) => z.literal(d))) });
/** POST /api/care/floors/:id/transfer: move the board of room `from` (anywhere) to room `to` on this floor */
export const FloorTransfer = z.object({ from: channelId, to: channelId });

/** POST /api/care/building/tickets/forget: forget the learned links of these projects */
export const TicketsForget = z.object({ projects: z.array(z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/)).min(1).max(1000) });

/** answer to a care action: number of posts removed or moved */
export const CareDone = z.object({ posts: count });
export type CareDone = z.infer<typeof CareDone>;

// ---------------------------------------------------------------- Building maintenance (ADR-0016, REST under /api/maintenance)

/** upper bound for the attachment size an admin may set (the upload route accepts at most this) */
export const MAX_FILE_MB = 100;

/** settings of the building that admins change in the web UI; the environment variables are the defaults */
export const BuildingSettings = z.object({
  /** posts are deleted automatically after this many days */
  retentionDays: z.number().int().min(1).max(3650),
  /** storage for attachments; when full, the oldest posts with attachments go first */
  quotaMB: z.number().int().min(10).max(1024 * 1024),
  /** largest attachment */
  maxFileMB: z.number().int().min(1).max(MAX_FILE_MB),
  /** data of deleted rooms is kept this many days before the cleanup removes it */
  graceDays: z.number().int().min(0).max(90),
  /** notice in the Mumble log of the others in the room when someone pins or brings a post */
  notifyNewPosts: z.boolean(),
});
export type BuildingSettings = z.infer<typeof BuildingSettings>;

/** GET /api/maintenance (and the answer to PUT /api/maintenance/settings): current values, defaults, storage used */
export const Maintenance = z.object({ settings: BuildingSettings, defaults: BuildingSettings, usedBytes: count });
export type Maintenance = z.infer<typeof Maintenance>;

// ---------------------------------------------------------------- Key cabinet (ADR-0015, REST under /api/keys)

/** a paired browser ("key"); `id` names it without revealing the token */
export const DeviceKey = z.object({
  id: z.string().regex(/^[0-9a-f]{16}$/),
  /** coarse description from the browser, e.g. "Firefox on Linux"; empty if not known */
  device: z.string().max(80),
  created: time,
  lastUsed: time.nullable(),
  /** the browser asking */
  current: z.boolean(),
});
export type DeviceKey = z.infer<typeof DeviceKey>;

/** GET /api/keys: the own keys; for admins (Write on the root channel) also everyone else's, by person */
export const KeyCabinet = z.object({
  mine: z.array(DeviceKey),
  others: z.array(z.object({ name: z.string(), keys: z.array(DeviceKey) })).nullable(),
});
export type KeyCabinet = z.infer<typeof KeyCabinet>;

// ---------------------------------------------------------------- Status (B, REST under /api/status)

/** GET /api/status (and the answer to PUT and DELETE): the own status and the texts used last, newest first */
export const StatusView = z.object({ current: UserStatus.nullable(), recent: z.array(z.string()).max(STATUS_LIMITS.recent) });
export type StatusView = z.infer<typeof StatusView>;
/** PUT /api/status: set the own status; `minutes` null: no expiry */
export const StatusRequest = z.object({
  text: z.string().trim().min(1).max(STATUS_LIMITS.textChars),
  minutes: z.number().int().min(1).max(STATUS_LIMITS.maxMinutes).nullable(),
});
export type StatusRequest = z.infer<typeof StatusRequest>;

// ---------------------------------------------------------------- Nudge (REST under /api/nudge, ADR-0020)

/** one nudge per person and minute for the same person */
export const NUDGE_INTERVAL_MS = 60_000;
/** POST /api/nudge: get the attention of a deafened person in the own room */
export const NudgeRequest = z.object({ session });
export type NudgeRequest = z.infer<typeof NudgeRequest>;

/** POST /api/board/posts/:id/copy: copy a post of the own room to another room the user may enter */
export const CopyRequest = z.object({ channelId });
export type CopyRequest = z.infer<typeof CopyRequest>;

/** PUT /api/board/posts/:id/tasks/:index: tick or untick one task of a task list (A2) */
export const TaskToggle = z.object({ done: z.boolean() });
export type TaskToggle = z.infer<typeof TaskToggle>;

/** POST /api/pair/request → a code goes to the Mumble log of the matching plugins (ADR-0012) */
export const PairRequested = z.object({ request: z.string().min(1) });
export type PairRequested = z.infer<typeof PairRequested>;
/** POST /api/pair/confirm: success sets the device token cookie */
export const PairConfirm = z.object({ request: z.string().min(1).max(64), code: z.string().regex(/^\d{6}$/) });
export type PairConfirm = z.infer<typeof PairConfirm>;
export const PairErrorCode = z.enum(["no-plugin", "rate-limited", "wrong-code", "expired", "invalid"]);
export type PairErrorCode = z.infer<typeof PairErrorCode>;
/** HTTP status of each pairing error (/api/pair/*) */
export const PAIR_ERROR_STATUS: Record<PairErrorCode, number> = { "no-plugin": 404, "rate-limited": 429, "wrong-code": 400, expired: 410, invalid: 400 };
export const PairError = z.object({ error: PairErrorCode });

/** GET /api/version: version of the service and of the plugin offered under /download (null: none) */
export const Versions = z.object({ service: z.string(), plugin: z.string().nullable() });
export type Versions = z.infer<typeof Versions>;

/** POST /api/board/posts */
export const NewPost = z.object({
  kind: PostKind,
  text: z.string().max(BOARD_LIMITS.textChars),
  language: z.string().max(40).optional(),
  /** for image/file: ID of a previously uploaded attachment (POST /api/board/uploads) */
  attachmentId: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  /** file name of the attachment (for display and download) */
  attachmentName: z.string().max(255).optional(),
});
export type NewPost = z.infer<typeof NewPost>;

/** PATCH /api/board/posts/<id> */
export const PostUpdate = z.object({ text: z.string().max(BOARD_LIMITS.textChars), language: z.string().max(40).optional() });
export type PostUpdate = z.infer<typeof PostUpdate>;

/** error response of the REST API */
export const BoardError = z.object({
  /** `not-deaf`: a nudge for someone who hears again (ADR-0020) */
  error: z.enum(["not-paired", "not-in-room", "no-board-here", "not-found", "forbidden", "too-large", "bad-type", "invalid", "rate-limited", "not-deaf"]),
});

export type BoardErrorCode = z.infer<typeof BoardError>["error"];

/** HTTP status of each REST error (board, care, keys, maintenance, status, nudge); one table for the whole service */
export const API_ERROR_STATUS: Record<BoardErrorCode, number> = {
  "not-paired": 401, "not-in-room": 403, "no-board-here": 404, "not-found": 404, forbidden: 403, "too-large": 413, "bad-type": 415, invalid: 400, "rate-limited": 429, "not-deaf": 409,
};

/** Minimal schema type so consumers need not import zod themselves */
export interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** WebSocket: something changed on this room's board (only to those present) */
export const UiBoard = z.object({ v, type: z.literal("board"), channelId });

/** WebSocket: someone in the room wants the attention of this (deafened) user; only to that user's web UIs (ADR-0020) */
export const UiNudge = z.object({ v, type: z.literal("nudge"), session, name: z.string() });

export const UiTalking = z.object({ v, type: z.literal("talking"), session, state: TalkingState });
export const UiResult = z.object({ v, type: z.literal("result"), id: commandId, result: CommandResult });
export const UiStatus = z.object({
  v,
  type: z.literal("status"),
  plugin: z.enum(["connected", "disconnected"]),
  /** preview: building read-only, without a paired plugin (service configuration) */
  preview: z.boolean().optional(),
});

export const BridgeToUi = z.discriminatedUnion("type", [Snapshot, UiTalking, UiResult, UiStatus, UiBoard, UiNudge]);
export type BridgeToUi = z.infer<typeof BridgeToUi>;

// ---------------------------------------------------------------- Helpers

/** All message families, e.g. for the plugin's JSON schema. */
export const Messages = { PluginToBridge, BridgeToPlugin, UiToBridge, BridgeToUi } as const;

/** Parses an incoming message. Returns `null` for invalid JSON or schema (never an exception). */
export function parse<T extends z.ZodType>(schema: T, raw: string): z.infer<T> | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = schema.safeParse(data);
  return result.success ? result.data : null;
}
