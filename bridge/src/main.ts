/**
 * Ruumble service (AP5). Configuration via environment variables (ADR-0008):
 *
 *   ICE_HOST, ICE_PORT (6502), ICE_SECRET_READ   Ice of the Mumble server, only the read secret
 *   ICE_SECRET_READ_FILE                         alternatively: file containing the read secret (Docker secret)
 *   SERVER_ID                                    optional, else the first running server
 *   PUBLIC_URL                                   base URL for pairing links (https://…)
 *   PORT (64080), HOST (0.0.0.0)                 HTTP/WebSocket
 *   WEB_DIST                                     built web UI (web/dist)
 *   DATA_DIR (./data)                            device tokens and board (board.sqlite, board/)
 *   PLUGIN_BUNDLE, PLUGIN_BUNDLE_DIR             optional: .mumble_plugin for /download (file or directory)
 *   ADDRESS_CHECK (warn)                         off | warn | enforce (ADR-0004, P7 open)
 *   TRUST_PROXY (false)                          true behind Nginx Proxy Manager
 *   PREVIEW (false)                              true: building visible read-only without pairing
 *   RETENTION_DAYS (30), BOARD_QUOTA_MB (2048)    board: retention and quota (ADR-0011)
 *   LOG_LEVEL (info)                             Fastify/pino logging
 *
 * Board backup:  node dist/main.mjs backup <target-directory>  (needs only DATA_DIR, no Ice)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import type { Versions } from "@ruumble/protocol";
import type { WebSocket } from "ws";
import pkg from "../package.json" with { type: "json" };
import { AvatarCache } from "./avatars.ts";
import { notifyRoom } from "./board/notify.ts";
import { boardRoutes } from "./board/routes.ts";
import { BoardStore } from "./board/store.ts";
import { Hub, type AddressCheck } from "./hub.ts";
import { keepAlive } from "./keepalive.ts";
import { IceMumbleSource } from "./mumble.ts";
import { Pairing } from "./pairing.ts";
import { Poller } from "./poller.ts";

const env = process.env;
const required = (key: string) => {
  const value = env[key];
  if (!value) throw new Error(`Environment variable ${key} is missing`);
  return value;
};
const bool = (key: string) => env[key] === "true" || env[key] === "1";

// board storage (ADR-0011); the backup needs nothing else, hence before the rest of the configuration
const dataDir = resolve(env.DATA_DIR ?? "data");
const quotaMB = Number(env.BOARD_QUOTA_MB ?? 2048);
const store = new BoardStore(dataDir, { retentionDays: Number(env.RETENTION_DAYS ?? 30), quotaBytes: quotaMB * 1024 * 1024 });
if (process.argv[2] === "backup") {
  const target = resolve(process.argv[3] ?? "backup");
  await store.backup(target);
  console.log(`Board backed up to ${target}`);
  process.exit(0);
}

const config = {
  iceHost: required("ICE_HOST"),
  icePort: Number(env.ICE_PORT ?? 6502),
  iceSecret: env.ICE_SECRET_READ_FILE ? readFileSync(env.ICE_SECRET_READ_FILE, "utf8").trim() : required("ICE_SECRET_READ"),
  serverId: env.SERVER_ID ? Number(env.SERVER_ID) : undefined,
  publicUrl: (env.PUBLIC_URL ?? "http://localhost:64080").replace(/\/$/, ""),
  port: Number(env.PORT ?? 64080),
  host: env.HOST ?? "0.0.0.0",
  webDist: resolve(env.WEB_DIST ?? new URL("../../web/dist", import.meta.url).pathname),
  pluginBundle: env.PLUGIN_BUNDLE
    ? resolve(env.PLUGIN_BUNDLE)
    : env.PLUGIN_BUNDLE_DIR && existsSync(env.PLUGIN_BUNDLE_DIR)
      ? (readdirSync(env.PLUGIN_BUNDLE_DIR).filter((f) => f.endsWith(".mumble_plugin")).sort().map((f) => resolve(env.PLUGIN_BUNDLE_DIR!, f)).pop() ?? null)
      : null,
  addressCheck: (env.ADDRESS_CHECK ?? "warn") as AddressCheck,
  trustProxy: bool("TRUST_PROXY"),
  preview: bool("PREVIEW"),
};

const app = Fastify({ logger: { level: env.LOG_LEVEL ?? "info" }, trustProxy: config.trustProxy });
const log = (msg: string, extra?: Record<string, unknown>) => app.log.info(extra ?? {}, msg);

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
    store.syncChannels(state.channels.map((c) => c.id));
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

app.get("/ws/plugin", { websocket: true }, (socket, req) => {
  wire(socket, hub.pluginConnected(conn(socket), req.ip));
});

app.get("/ws/ui", { websocket: true }, (socket, req) => {
  const certHash = pairing.certHashOf(cookieOf(req.headers.cookie, TOKEN_COOKIE));
  wire(socket, hub.uiConnected(conn(socket), certHash));
});

app.get<{ Querystring: { code?: string } }>("/pair", async (req, reply) => {
  const token = req.query.code ? pairing.redeem(req.query.code) : null;
  if (!token) {
    // language like the web UI: German if the browser prefers it, otherwise English
    const de = /^\s*de\b/i.test(String(req.headers["accept-language"] ?? "").split(",").find((l) => /^\s*(de|en)\b/i.test(l)) ?? "");
    const text = de
      ? "Der Kopplungslink ist ungültig oder abgelaufen. Verbinde Mumble neu, um einen neuen zu erhalten."
      : "The pairing link is invalid or has expired. Reconnect Mumble to get a new one.";
    return reply.code(400).type("text/html; charset=utf-8").send(`<!doctype html><html lang="${de ? "de" : "en"}"><meta charset="utf-8"><p>${text}</p></html>`);
  }
  const secure = config.publicUrl.startsWith("https://") ? "; Secure" : "";
  reply.header("Set-Cookie", `${TOKEN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
  return reply.redirect("/");
});

app.post("/logout", async (req, reply) => {
  const token = cookieOf(req.headers.cookie, TOKEN_COOKIE);
  if (token) pairing.revoke(token);
  reply.header("Set-Cookie", `${TOKEN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return { ok: true };
});

// avatar images (AP9): only for paired web UIs or in preview; URL is versioned (?v=)
app.get<{ Params: { userId: string } }>("/avatar/:userId", async (req, reply) => {
  if (!hub.canView(pairing.certHashOf(cookieOf(req.headers.cookie, TOKEN_COOKIE)))) return reply.code(401).send();
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
  source,
  certHashOf: (cookie) => pairing.certHashOf(cookieOf(cookie, TOKEN_COOKIE)),
  // notice in the Mumble log of the other people present (AP11.4)
  onNewPost: (post, viewer) => void notifyRoom(hub, post, viewer),
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
    board: { usedMB: Math.round(store.usedBytes() / 1024 / 1024), quotaMB },
  });
});

// shown on the notice pages of the web UI; the plugin version comes from the bundle's file name (ruumble-<version>.mumble_plugin)
const versions: Versions = {
  service: pkg.version,
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
