/**
 * Ruumble service (AP5). Configuration via environment variables (ADR-0008):
 *
 *   ICE_HOST, ICE_PORT (6502), ICE_SECRET_READ   Ice of the Mumble server, only the read secret
 *   ICE_SECRET_READ_FILE                         alternatively: file containing the read secret (Docker secret)
 *   SERVER_ID                                    optional, else the first running server
 *   PUBLIC_URL                                   optional base URL for pairing links; unset: the address the plugin connected to
 *   PORT (64080), HOST (0.0.0.0)                 HTTP/WebSocket
 *   WEB_DIST                                     built web UI (web/dist)
 *   DATA_DIR (./data)                            device tokens and board (board.sqlite, board/)
 *   PLUGIN_BUNDLE, PLUGIN_BUNDLE_DIR             optional: .mumble_plugin for /download (file or directory)
 *   ADDRESS_CHECK (warn)                         off | warn | enforce (ADR-0004; behind hairpin NAT only warn works, P7)
 *   TRUST_PROXY (false)                          behind a reverse proxy: its address(es) or CIDR, comma-separated (then
 *                                                X-Forwarded-For/-Proto/-Host count only from there, ADR-0017); true trusts
 *                                                every sender and is only right if nothing else reaches the port
 *   PREVIEW (false)                              true: building visible read-only without pairing
 *   RETENTION_DAYS (365), BOARD_QUOTA_MB (2048)   board: retention and quota (ADR-0011); defaults, admins may change
 *                                                them in the building maintenance (ADR-0016), like the largest
 *                                                attachment (10 MB), the grace for deleted rooms (7 days) and notices
 *                                                (whole numbers: 1–3650 days, at least 10 MB, else the start fails)
 *   LOG_LEVEL (info)                             Fastify/pino logging
 *   BUILD_VERSION                                set by the image build: the exact build (git describe), shown instead of
 *                                                the package version under /api/version and in the log
 *
 * Board backup:  node dist/main.mjs backup <target-directory>  (needs only DATA_DIR, no Ice)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { BuildingSettings, PAIR_ERROR_STATUS, PairConfirm, type Versions } from "@ruumble/protocol";
import type { WebSocket } from "ws";
import pkg from "../package.json" with { type: "json" };
import { Gate } from "./access.ts";
import { AvatarCache } from "./avatars.ts";
import { careRoutes } from "./board/care.ts";
import { notifyCare, notifyRoom } from "./board/notify.ts";
import { boardRoutes } from "./board/routes.ts";
import { BoardStore } from "./board/store.ts";
import { Hub, type AddressCheck } from "./hub.ts";
import { keepAlive } from "./keepalive.ts";
import { keyRoutes } from "./keys.ts";
import { maintenanceRoutes } from "./maintenance.ts";
import { IceMumbleSource } from "./mumble.ts";
import { originGuard } from "./origin.ts";
import { Pairing } from "./pairing.ts";
import { Poller } from "./poller.ts";

const env = process.env;
const required = (key: string) => {
  const value = env[key];
  if (!value) throw new Error(`Environment variable ${key} is missing`);
  return value;
};
const bool = (key: string) => env[key] === "true" || env[key] === "1";
/** TRUST_PROXY: false, true, or the proxy's addresses / CIDR ranges (ADR-0017) */
function trustProxyOf(value: string | undefined): boolean | string[] {
  const v = value?.trim() ?? "";
  if (v === "" || v === "false" || v === "0") return false;
  if (v === "true" || v === "1") return true;
  return v.split(",").map((a) => a.trim()).filter(Boolean);
}
const readSecret = (file: string) => {
  try {
    return readFileSync(file, "utf8").trim();
  } catch (e) {
    const denied = (e as NodeJS.ErrnoException).code === "EACCES";
    throw new Error(`ICE_SECRET_READ_FILE ${file} cannot be read${denied ? ` by uid ${process.getuid?.()}: make the file readable (chmod 644)` : `: ${e}`}`);
  }
};

/** a default of the building maintenance (ADR-0016): within the range admins may set, else the settings could not be saved */
const settingDefault = (name: string, key: "retentionDays" | "quotaMB", fallback: number) => {
  const value = Number(env[name] ?? fallback);
  const { minValue, maxValue } = BuildingSettings.shape[key];
  if (Number.isInteger(value) && value >= minValue! && value <= maxValue!) return value;
  throw new Error(`${name} must be a whole number from ${minValue} to ${maxValue}`);
};

// board storage (ADR-0011); the backup needs nothing else, hence before the rest of the configuration
const dataDir = resolve(env.DATA_DIR ?? "data");
const store = new BoardStore(dataDir, { retentionDays: settingDefault("RETENTION_DAYS", "retentionDays", 365), quotaBytes: settingDefault("BOARD_QUOTA_MB", "quotaMB", 2048) * 1024 * 1024 });
if (process.argv[2] === "backup") {
  const target = resolve(process.argv[3] ?? "backup");
  await store.backup(target);
  console.log(`Board backed up to ${target}`);
  process.exit(0);
}

const config = {
  iceHost: required("ICE_HOST"),
  icePort: Number(env.ICE_PORT ?? 6502),
  iceSecret: env.ICE_SECRET_READ_FILE ? readSecret(env.ICE_SECRET_READ_FILE) : required("ICE_SECRET_READ"),
  serverId: env.SERVER_ID ? Number(env.SERVER_ID) : undefined,
  publicUrl: env.PUBLIC_URL ? env.PUBLIC_URL.replace(/\/$/, "") : undefined,
  port: Number(env.PORT ?? 64080),
  host: env.HOST ?? "0.0.0.0",
  webDist: resolve(env.WEB_DIST ?? new URL("../../web/dist", import.meta.url).pathname),
  pluginBundle: env.PLUGIN_BUNDLE
    ? resolve(env.PLUGIN_BUNDLE)
    : env.PLUGIN_BUNDLE_DIR && existsSync(env.PLUGIN_BUNDLE_DIR)
      ? (readdirSync(env.PLUGIN_BUNDLE_DIR).filter((f) => f.endsWith(".mumble_plugin")).sort().map((f) => resolve(env.PLUGIN_BUNDLE_DIR!, f)).pop() ?? null)
      : null,
  addressCheck: (env.ADDRESS_CHECK ?? "warn") as AddressCheck,
  trustProxy: trustProxyOf(env.TRUST_PROXY),
  preview: bool("PREVIEW"),
};

const app = Fastify({ logger: { level: env.LOG_LEVEL ?? "info" }, trustProxy: config.trustProxy });
const log = (msg: string, extra?: Record<string, unknown>) => app.log.info(extra ?? {}, msg);
if (config.trustProxy === true) {
  app.log.warn("TRUST_PROXY=true trusts X-Forwarded-For from every sender; set the proxy's address instead (ADR-0017)");
}

const pairing = new Pairing(resolve(dataDir, "tokens.json"));
let lastPoll = 0;
let lastError: string | null = null;

async function connectIce(): Promise<IceMumbleSource> {
  for (let attempt = 1; ; attempt++) {
    try {
      const source = await IceMumbleSource.connect({ host: config.iceHost, port: config.icePort, secret: config.iceSecret, serverId: config.serverId });
      log("Ice connected", { host: config.iceHost, port: config.icePort });
      return source;
    } catch (e) {
      lastError = String(e);
      app.log.warn({ attempt, error: lastError }, "Ice unreachable, retrying in 5 s");
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

const source = await connectIce();
const avatars: AvatarCache = new AvatarCache({ fetch: (id) => source.texture(id), onChange: () => hub.rebroadcast() });
const hub: Hub = new Hub({
  source,
  pairing,
  publicUrl: config.publicUrl,
  addressCheck: config.addressCheck,
  preview: config.preview,
  log,
  // access permissions only for paired sessions (ADR-0003)
  onSessionsChanged: (sessions) => poller.watchSessions(sessions),
  refresh: () => poller.poll(),
  avatarVersion: (id) => avatars.version(id),
});
const poller: Poller = new Poller(source, {
  onChange: (state) => {
    avatars.sync(state.users.flatMap((u) => (u.userId === null ? [] : [u.userId])));
    store.syncChannels(state.channels);
    hub.setState(state);
  },
  onPolled: () => {
    lastPoll = Date.now();
    lastError = null;
  },
  onRestart: () => {
    log("Mumble server restarted");
    hub.serverRestarted();
  },
  onError: (e) => {
    lastError = String(e);
    app.log.warn({ error: lastError }, "Query failed");
  },
});
poller.start();

// ---------------------------------------------------------------- HTTP

await app.register(fastifyWebsocket, { options: { maxPayload: 64 * 1024 } });

// only the service's own pages may use the cookie, and no web page may pose as a plugin (ADR-0017)
app.addHook("onRequest", originGuard(config.publicUrl, (msg, extra) => app.log.warn(extra, msg)));

// Content-Security-Policy for the web UI (ADR-0011): no foreign sources, no inline scripts
app.addHook("onSend", async (_req, reply, payload) => {
  const type = String(reply.getHeader("content-type") ?? "");
  if (type.startsWith("text/html")) {
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    reply.header("X-Content-Type-Options", "nosniff");
  }
  return payload;
});

const TOKEN_COOKIE = "ruumble_token";
const cookieOf = (header: string | undefined, name: string) =>
  header?.split(";").map((c) => c.trim().split("=")).find(([k]) => k === name)?.[1];
const tokenOf = (cookieHeader: string | undefined) => cookieOf(cookieHeader, TOKEN_COOKIE);
// who is asking, their Write permission, and how a refusal looks: one gate for every REST module (access.ts)
const gate = new Gate({ hub, source, certHashOf: (cookieHeader) => pairing.certHashOf(tokenOf(cookieHeader)) });

function wire(socket: WebSocket, handler: { onMessage(raw: string): unknown; onClose(): void }) {
  keepAlive(socket);
  socket.on("message", (data) => void handler.onMessage(String(data)));
  socket.on("close", () => handler.onClose());
  socket.on("error", () => handler.onClose());
}
const conn = <T>(socket: WebSocket) => ({
  send: (msg: T) => socket.readyState === socket.OPEN && socket.send(JSON.stringify(msg)),
  close: (code: number, reason: string) => socket.close(code, reason),
});

// The plugin reaches the service at the address from the root channel description, the same one users open.
// Behind a reverse proxy, protocol and host come from X-Forwarded-Proto/-Host (TRUST_PROXY).
const baseUrlOf = (req: FastifyRequest) => `${req.protocol}://${req.host}`;

app.get("/ws/plugin", { websocket: true }, (socket, req) => {
  wire(socket, hub.pluginConnected(conn(socket), req.ip, baseUrlOf(req)));
});

app.get("/ws/ui", { websocket: true }, (socket, req) => {
  const token = tokenOf(req.headers.cookie);
  pairing.touch(token, req.headers["user-agent"]); // key cabinet: last used, device (ADR-0015)
  wire(socket, hub.uiConnected(conn(socket), pairing.certHashOf(token), pairing.keyIdOf(token)));
});

app.get<{ Querystring: { code?: string } }>("/pair", async (req, reply) => {
  const token = req.query.code ? pairing.redeem(req.query.code, Date.now(), req.headers["user-agent"]) : null;
  if (!token) {
    // language like the web UI: German if the browser prefers it, otherwise English
    const de = /^\s*de\b/i.test(String(req.headers["accept-language"] ?? "").split(",").find((l) => /^\s*(de|en)\b/i.test(l)) ?? "");
    const text = de
      ? "Der Kopplungslink ist ungültig oder abgelaufen. Öffne Ruumble und kopple diesen Browser mit einem Code aus dem Mumble-Protokoll."
      : "The pairing link is invalid or has expired. Open Ruumble and pair this browser with a code from the Mumble log.";
    return reply
      .code(400)
      .type("text/html; charset=utf-8")
      .send(`<!doctype html><html lang="${de ? "de" : "en"}"><meta charset="utf-8"><p>${text}</p><p><a href="/">Ruumble</a></p></html>`);
  }
  setTokenCookie(req, reply, token);
  hub.keyIssued(pairing.certHashOf(token)!); // the owner learns about it in the Mumble log (ADR-0017)
  return reply.redirect("/");
});

function setTokenCookie(req: FastifyRequest, reply: FastifyReply, token: string): void {
  const secure = (config.publicUrl ?? baseUrlOf(req)).startsWith("https://") ? "; Secure" : "";
  reply.header("Set-Cookie", `${TOKEN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
}

// pairing further browsers with a code from the Mumble log (ADR-0012)
app.post("/api/pair/request", async (req, reply) => {
  const result = hub.requestPairing(req.ip);
  return typeof result === "string" ? reply.code(PAIR_ERROR_STATUS[result]).send({ error: result }) : result;
});
app.post("/api/pair/confirm", async (req, reply) => {
  const body = PairConfirm.safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "invalid" });
  const result = pairing.confirmCode(body.data.request, body.data.code, Date.now(), req.headers["user-agent"]);
  if (result === "wrong-code" || result === "expired") return reply.code(PAIR_ERROR_STATUS[result]).send({ error: result });
  setTokenCookie(req, reply, result);
  hub.keyIssued(pairing.certHashOf(result)!);
  return { ok: true };
});

// key cabinet: the own paired browsers, everyone's for admins (ADR-0015)
await app.register(keyRoutes, {
  pairing,
  hub,
  gate,
  tokenOf,
  clearCookie: (reply) => void reply.header("Set-Cookie", `${TOKEN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`),
  log,
});

// building maintenance: settings that used to be fixed (ADR-0016)
await app.register(maintenanceRoutes, { store, gate, log });

app.post("/logout", async (req, reply) => {
  const token = tokenOf(req.headers.cookie);
  if (token) pairing.revoke(token);
  reply.header("Set-Cookie", `${TOKEN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return { ok: true };
});

// avatar images (AP9): only for paired web UIs or in preview; URL is versioned (?v=)
app.get<{ Params: { userId: string } }>("/avatar/:userId", async (req, reply) => {
  if (!hub.canView(gate.certHash(req))) return reply.code(401).send();
  const avatar = /^\d+$/.test(req.params.userId) ? avatars.get(Number(req.params.userId)) : null;
  if (!avatar) return reply.code(404).send();
  return reply
    .header("Content-Type", avatar.mime)
    .header("X-Content-Type-Options", "nosniff")
    .header("Cache-Control", "private, max-age=86400, immutable")
    .send(Buffer.from(avatar.bytes));
});

await app.register(boardRoutes, {
  store,
  hub,
  gate,
  // notice in the Mumble log of the other people present (AP11.4)
  onNewPost: (post, viewer) => void (store.settings.notifyNewPosts && notifyRoom(hub, post, viewer)),
});
// care of the stored data: the plants (ADR-0014)
await app.register(careRoutes, {
  store,
  hub,
  gate,
  onChanged: (channelId, viewer, change) => void notifyCare(hub, channelId, viewer, change),
  log,
});
const cleanupTimer = setInterval(() => {
  const { removed, channels } = store.cleanup();
  if (removed) {
    log("Board cleaned up", { removed });
    for (const channelId of channels) hub.boardChanged(channelId); // open boards reload
  }
}, 60 * 60_000);

app.get("/healthz", async (_req, reply) => {
  const healthy = Date.now() - lastPoll < 10_000;
  return reply.code(healthy ? 200 : 503).send({
    ice: healthy ? "ok" : "stale",
    lastPoll: lastPoll ? new Date(lastPoll).toISOString() : null,
    lastError,
    plugins: hub.pluginCount,
    mumbleServer: hub.serverVersion,
    clients: hub.clientVersions(),
    board: { usedMB: Math.round(store.usedBytes() / 1024 / 1024), quotaMB: store.settings.quotaMB },
  });
});

// shown on the notice pages of the web UI; the plugin version comes from the bundle's file name (ruumble-<version>.mumble_plugin)
const versions: Versions = {
  service: env.BUILD_VERSION || pkg.version,
  plugin: config.pluginBundle && existsSync(config.pluginBundle) ? (/-(\d+\.\d+\.\d+)\.mumble_plugin$/.exec(config.pluginBundle)?.[1] ?? null) : null,
};
app.get("/api/version", async () => versions);

if (config.pluginBundle && existsSync(config.pluginBundle)) {
  const file = config.pluginBundle;
  app.get("/download", async (_req, reply) =>
    reply.header("Content-Disposition", `attachment; filename="${basename(file)}"`).sendFile(basename(file), resolve(file, "..")),
  );
}

if (existsSync(config.webDist)) {
  await app.register(fastifyStatic, { root: config.webDist, wildcard: false });
} else {
  app.log.warn({ webDist: config.webDist }, "Web UI not found (pnpm -F @ruumble/web build)");
}

await app.listen({ port: config.port, host: config.host });
log("Ruumble started", { version: versions.service });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    poller.stop();
    clearInterval(cleanupTimer);
    store.close();
    await app.close();
    await source.close();
    process.exit(0);
  });
}
