/**
 * Ruumble protocol, version 1 (ADR-0007).
 *
 * JSON over WebSocket, every message has the form `{ v: 1, type, ... }`.
 * Service endpoints: `/ws/plugin` (plugin ↔ service) and `/ws/ui` (web UI ↔ service).
 *
 * The service delivers raw Mumble data. The building is only derived in the web UI.
 */
import { z } from "zod";

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
});
export type Channel = z.infer<typeof Channel>;

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

export const RejectReason = z.enum(["unknown-session", "hash-mismatch", "address-mismatch", "no-certificate"]);

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

/** Quick reactions with a fixed meaning (A1), in display order */
export const REACTION_KINDS = ["agree", "looking", "done", "broken", "unclear"] as const;
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
  /** only kinds with at least one reaction, in the order of REACTION_KINDS */
  reactions: z.array(Reaction),
});
export type Post = z.infer<typeof Post>;

/** GET /api/board: board of the room the own user is currently in */
export const BoardView = z.object({ channelId, channelName: z.string(), posts: z.array(Post) });
export type BoardView = z.infer<typeof BoardView>;

/** POST /api/pair/request → a code goes to the Mumble log of the matching plugins (ADR-0012) */
export const PairRequested = z.object({ request: z.string().min(1) });
export type PairRequested = z.infer<typeof PairRequested>;
/** POST /api/pair/confirm: success sets the device token cookie */
export const PairConfirm = z.object({ request: z.string().min(1).max(64), code: z.string().regex(/^\d{6}$/) });
export type PairConfirm = z.infer<typeof PairConfirm>;
export const PairErrorCode = z.enum(["no-plugin", "rate-limited", "wrong-code", "expired", "invalid"]);
export type PairErrorCode = z.infer<typeof PairErrorCode>;
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
  error: z.enum(["not-paired", "not-in-room", "no-board-here", "not-found", "forbidden", "too-large", "bad-type", "invalid", "rate-limited"]),
});

export type BoardErrorCode = z.infer<typeof BoardError>["error"];

/** Minimal schema type so consumers need not import zod themselves */
export interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** WebSocket: something changed on this room's board (only to those present) */
export const UiBoard = z.object({ v, type: z.literal("board"), channelId });

export const UiTalking = z.object({ v, type: z.literal("talking"), session, state: TalkingState });
export const UiResult = z.object({ v, type: z.literal("result"), id: commandId, result: CommandResult });
export const UiStatus = z.object({
  v,
  type: z.literal("status"),
  plugin: z.enum(["connected", "disconnected"]),
  /** preview: building read-only, without a paired plugin (service configuration) */
  preview: z.boolean().optional(),
});

export const BridgeToUi = z.discriminatedUnion("type", [Snapshot, UiTalking, UiResult, UiStatus, UiBoard]);
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
