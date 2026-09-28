/**
 * Ruumble-Protokoll, Version 1 (ADR-0007).
 *
 * JSON über WebSocket, jede Nachricht hat die Form `{ v: 1, type, ... }`.
 * Endpunkte des Dienstes: `/ws/plugin` (Plugin ↔ Dienst) und `/ws/ui` (Oberfläche ↔ Dienst).
 *
 * Der Dienst liefert Mumble-Rohdaten. Das Gebäude wird erst in der Oberfläche abgeleitet.
 */
import { z } from "zod";

export const PROTOCOL_VERSION = 1 as const;

const v = z.literal(PROTOCOL_VERSION);
const channelId = z.number().int().min(0);
const session = z.number().int().min(1);

// ---------------------------------------------------------------- Mumble-Rohdaten

/** Kanal wie von Ice geliefert. Der Root-Kanal hat `id 0` und `parent null` (in Ice: -1). */
export const Channel = z.object({
  id: channelId,
  parent: channelId.nullable(),
  name: z.string(),
  position: z.number().int(),
  /** Direkt verlinkte Kanäle, symmetrisch (S1). */
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
  /** vom Server bzw. Admin gesetzt */
  mute: z.boolean(),
  deaf: z.boolean(),
  suppress: z.boolean(),
  /** registrierte Nutzer-ID, `null` für unregistrierte Nutzer (AP9) */
  userId: z.number().int().min(0).nullable(),
  /** Version des Avatarbilds (Hash), `null` ohne Avatar; Bild unter /avatar/<userId>?v=<avatar> (AP9) */
  avatar: z.string().regex(/^[0-9a-f]{16}$/).nullable(),
  /** volle Minuten seit dem letzten Sprechen (Ice idlesecs zählt nur Sprechen, AP10) */
  idleMinutes: z.number().int().min(0),
  /** zeichnet gerade auf (AP10) */
  recording: z.boolean(),
});
export type User = z.infer<typeof User>;

/** Mumble_TalkingState ohne INVALID; `talking-muted` = spricht, ist aber lokal stummgeschaltet. */
export const TalkingState = z.enum(["passive", "talking", "whispering", "shouting", "talking-muted"]);
export type TalkingState = z.infer<typeof TalkingState>;

/** Schlüssel eines JSON-Objekts, das eine Kanal-ID abbildet. */
const channelKey = z.string().regex(/^\d+$/);

// ---------------------------------------------------------------- Befehle

export const CommandBody = z.discriminatedUnion("cmd", [
  z.object({ cmd: z.literal("join"), channel: channelId }),
  z.object({ cmd: z.literal("mute"), on: z.boolean() }),
  z.object({ cmd: z.literal("deaf"), on: z.boolean() }),
]);
export type CommandBody = z.infer<typeof CommandBody>;

export const CommandResult = z.enum(["ok", "rejected", "superseded", "timeout", "offline"]);
export type CommandResult = z.infer<typeof CommandResult>;

const commandId = z.string().min(1).max(64);

// ---------------------------------------------------------------- Plugin → Dienst

export const PluginHello = z.object({
  v,
  type: z.literal("hello"),
  session,
  /** SHA1 hex des Client-Zertifikats (getUserHash), stabiler Schlüssel der Kopplung (ADR-0004) */
  certHash: z.string().regex(/^[0-9a-f]{40}$/),
  pluginVersion: z.string(),
  /** Das Plugin hat bereits eine gekoppelte Oberfläche (Flag in plugin.json). */
  paired: z.boolean(),
});

export const PluginResult = z.object({ v, type: z.literal("result"), id: commandId, result: CommandResult });
export const PluginSelfState = z.object({ v, type: z.literal("selfState"), selfMute: z.boolean(), selfDeaf: z.boolean() });
export const PluginTalking = z.object({ v, type: z.literal("talking"), session, state: TalkingState });
export const PluginBye = z.object({ v, type: z.literal("bye") });

export const PluginToBridge = z.discriminatedUnion("type", [PluginHello, PluginResult, PluginSelfState, PluginTalking, PluginBye]);
export type PluginToBridge = z.infer<typeof PluginToBridge>;

// ---------------------------------------------------------------- Dienst → Plugin

export const RejectReason = z.enum(["unknown-session", "hash-mismatch", "address-mismatch", "no-certificate", "unsupported-version"]);

export const BridgeWelcome = z.object({ v, type: z.literal("welcome"), pairUrl: z.url().optional() });
export const BridgeReject = z.object({ v, type: z.literal("reject"), reason: RejectReason });
export const BridgeCommand = z.object({ v, type: z.literal("command"), id: commandId, body: CommandBody });

export const BridgeToPlugin = z.discriminatedUnion("type", [BridgeWelcome, BridgeReject, BridgeCommand]);
export type BridgeToPlugin = z.infer<typeof BridgeToPlugin>;

// ---------------------------------------------------------------- Oberfläche → Dienst

export const UiCommand = z.object({ v, type: z.literal("command"), id: commandId, body: CommandBody });

export const UiToBridge = z.discriminatedUnion("type", [UiCommand]);
export type UiToBridge = z.infer<typeof UiToBridge>;

// ---------------------------------------------------------------- Dienst → Oberfläche

export const Snapshot = z.object({
  v,
  type: z.literal("snapshot"),
  server: z.object({
    /** registername, Fallback „Root“ (wie der Mumble-Client) */
    name: z.string(),
    version: z.string(),
  }),
  /** eigener Nutzer. `null`, solange kein gekoppeltes Plugin verbunden ist. */
  self: z.object({ session }).nullable(),
  channels: z.array(Channel),
  users: z.array(User),
  /** Kanal-ID → Sessions, die dort mitlauschen */
  listeners: z.record(channelKey, z.array(session)),
  /** Kanal-ID → darf der eigene Nutzer den Kanal betreten (PermissionEnter). Fehlt ein Kanal, gilt `true`. */
  canEnter: z.record(channelKey, z.boolean()),
});
export type Snapshot = z.infer<typeof Snapshot>;

// ---------------------------------------------------------------- Pinnwand (ADR-0011, REST unter /api/board)

/** Grenzen der Pinnwand (ADR-0011) */
export const BOARD_LIMITS = { fileBytes: 10 * 1024 * 1024, textChars: 100_000 } as const;

export const PostKind = z.enum(["text", "code", "image", "file"]);
export type PostKind = z.infer<typeof PostKind>;

export const Attachment = z.object({
  /** SHA-256 hex des Inhalts; Abruf unter /api/board/files/<id> */
  id: z.string().regex(/^[0-9a-f]{64}$/),
  name: z.string().max(255),
  mime: z.string(),
  size: z.number().int().min(0),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
});
export type Attachment = z.infer<typeof Attachment>;

/** Antwort auf POST /api/board/uploads: `image` = als Bild erkannt (an den Bytes, nie SVG) */
export const Uploaded = Attachment.extend({ image: z.boolean() });
export type Uploaded = z.infer<typeof Uploaded>;

export const Post = z.object({
  id: z.string().min(1),
  channelId,
  kind: PostKind,
  /** Markdown (text), Quelltext (code) oder Bildunterschrift (image/file) – immer Rohtext, nie HTML */
  text: z.string().max(BOARD_LIMITS.textChars),
  /** Sprache des Codes (highlight.js), leer: automatisch erkennen */
  language: z.string().max(40).optional(),
  attachment: Attachment.optional(),
  authorName: z.string(),
  /** vom eigenen Nutzer verfasst (darf löschen) */
  mine: z.boolean(),
  /** darf der eigene Nutzer löschen (Autor oder Mumble-Admin) */
  canDelete: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  updatedByName: z.string().optional(),
});
export type Post = z.infer<typeof Post>;

/** GET /api/board: Pinnwand des Raums, in dem der eigene Nutzer gerade ist */
export const BoardView = z.object({ channelId, channelName: z.string(), posts: z.array(Post) });
export type BoardView = z.infer<typeof BoardView>;

/** POST /api/board/posts */
export const NewPost = z.object({
  kind: PostKind,
  text: z.string().max(BOARD_LIMITS.textChars),
  language: z.string().max(40).optional(),
  /** für image/file: ID eines zuvor hochgeladenen Anhangs (POST /api/board/uploads) */
  attachmentId: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  /** Dateiname des Anhangs (für Anzeige und Download) */
  attachmentName: z.string().max(255).optional(),
});
export type NewPost = z.infer<typeof NewPost>;

/** PATCH /api/board/posts/<id> */
export const PostUpdate = z.object({ text: z.string().max(BOARD_LIMITS.textChars), language: z.string().max(40).optional() });
export type PostUpdate = z.infer<typeof PostUpdate>;

/** Fehlerantwort der REST-Schnittstelle */
export const BoardError = z.object({
  error: z.enum(["not-paired", "not-in-room", "no-board-here", "not-found", "forbidden", "too-large", "bad-type", "invalid", "rate-limited"]),
});

export type BoardErrorCode = z.infer<typeof BoardError>["error"];

/** Minimaler Schema-Typ, damit Verbraucher zod nicht selbst importieren müssen */
export interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** WebSocket: An der Pinnwand dieses Raums hat sich etwas geändert (nur an Anwesende) */
export const UiBoard = z.object({ v, type: z.literal("board"), channelId });

export const UiTalking = z.object({ v, type: z.literal("talking"), session, state: TalkingState });
export const UiResult = z.object({ v, type: z.literal("result"), id: commandId, result: CommandResult });
export const UiStatus = z.object({
  v,
  type: z.literal("status"),
  plugin: z.enum(["connected", "disconnected"]),
  /** Vorschau: Gebäude nur lesend, ohne gekoppeltes Plugin (Konfiguration des Dienstes) */
  preview: z.boolean().optional(),
});

export const BridgeToUi = z.discriminatedUnion("type", [Snapshot, UiTalking, UiResult, UiStatus, UiBoard]);
export type BridgeToUi = z.infer<typeof BridgeToUi>;

// ---------------------------------------------------------------- Hilfen

/** Alle Nachrichtenfamilien, z. B. für das JSON-Schema des Plugins. */
export const Messages = { PluginToBridge, BridgeToPlugin, UiToBridge, BridgeToUi } as const;

/** Parst eine eingehende Nachricht. Liefert `null` bei ungültigem JSON oder Schema (nie eine Exception). */
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
