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

export const UiTalking = z.object({ v, type: z.literal("talking"), session, state: TalkingState });
export const UiResult = z.object({ v, type: z.literal("result"), id: commandId, result: CommandResult });
export const UiStatus = z.object({
  v,
  type: z.literal("status"),
  plugin: z.enum(["connected", "disconnected"]),
  /** Vorschau: Gebäude nur lesend, ohne gekoppeltes Plugin (Konfiguration des Dienstes) */
  preview: z.boolean().optional(),
});

export const BridgeToUi = z.discriminatedUnion("type", [Snapshot, UiTalking, UiResult, UiStatus]);
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
