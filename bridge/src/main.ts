/**
 * Ruumble-Dienst (AP5). Konfiguration über Umgebungsvariablen (ADR-0008):
 *
 *   ICE_HOST, ICE_PORT (6502), ICE_SECRET_READ   Ice des Mumble-Servers, nur das Read-Secret
 *   SERVER_ID                                    optional, sonst erster laufender Server
 *   PUBLIC_URL                                   Basis-URL für Kopplungslinks (https://…)
 *   PORT (8080), HOST (0.0.0.0)                  HTTP/WebSocket
 *   WEB_DIST                                     gebaute Oberfläche (web/dist)
 *   DATA_DIR (./data)                            Geräte-Tokens
 *   PLUGIN_BUNDLE                                optional: Pfad zum .mumble_plugin für /download
 *   ADDRESS_CHECK (warn)                         off | warn | enforce (ADR-0004, P7 offen)
 *   TRUST_PROXY (false)                          true hinter Nginx Proxy Manager
 *   PREVIEW (false)                              true: Gebäude ohne Kopplung nur lesend sichtbar
 */
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import type { WebSocket } from "ws";
import { Hub, type AddressCheck } from "./hub.ts";
import { IceMumbleSource } from "./mumble.ts";
import { Pairing } from "./pairing.ts";
import { Poller } from "./poller.ts";

const env = process.env;
const required = (key: string) => {
  const value = env[key];
  if (!value) throw new Error(`Umgebungsvariable ${key} fehlt`);
  return value;
};
const bool = (key: string) => env[key] === "true" || env[key] === "1";

const config = {
  iceHost: required("ICE_HOST"),
  icePort: Number(env.ICE_PORT ?? 6502),
  iceSecret: required("ICE_SECRET_READ"),
  serverId: env.SERVER_ID ? Number(env.SERVER_ID) : undefined,
  publicUrl: (env.PUBLIC_URL ?? "http://localhost:8080").replace(/\/$/, ""),
  port: Number(env.PORT ?? 8080),
  host: env.HOST ?? "0.0.0.0",
  webDist: resolve(env.WEB_DIST ?? new URL("../../web/dist", import.meta.url).pathname),
  dataDir: resolve(env.DATA_DIR ?? "data"),
  pluginBundle: env.PLUGIN_BUNDLE ? resolve(env.PLUGIN_BUNDLE) : null,
  addressCheck: (env.ADDRESS_CHECK ?? "warn") as AddressCheck,
  trustProxy: bool("TRUST_PROXY"),
  preview: bool("PREVIEW"),
};

const app = Fastify({ logger: { level: env.LOG_LEVEL ?? "info" }, trustProxy: config.trustProxy });
const log = (msg: string, extra?: Record<string, unknown>) => app.log.info(extra ?? {}, msg);

const pairing = new Pairing(resolve(config.dataDir, "tokens.json"));
let lastPoll = 0;
let lastError: string | null = null;

async function connectIce(): Promise<IceMumbleSource> {
  for (let attempt = 1; ; attempt++) {
    try {
      const source = await IceMumbleSource.connect({ host: config.iceHost, port: config.icePort, secret: config.iceSecret, serverId: config.serverId });
      log("Ice verbunden", { host: config.iceHost, port: config.icePort });
      return source;
    } catch (e) {
      lastError = String(e);
      app.log.warn({ attempt, error: lastError }, "Ice nicht erreichbar, neuer Versuch in 5 s");
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

const source = await connectIce();
const hub: Hub = new Hub({
  source,
  pairing,
  publicUrl: config.publicUrl,
  addressCheck: config.addressCheck,
  preview: config.preview,
  log,
  // Zutrittsrechte nur für gekoppelte Sessions (ADR-0003)
  onSessionsChanged: (sessions) => poller.watchSessions(sessions),
  refresh: () => poller.poll(),
});
const poller: Poller = new Poller(source, {
  onChange: (state) => hub.setState(state),
  onPolled: () => {
    lastPoll = Date.now();
    lastError = null;
  },
  onRestart: () => {
    log("Mumble-Server neu gestartet");
    hub.serverRestarted();
  },
  onError: (e) => {
    lastError = String(e);
    app.log.warn({ error: lastError }, "Abfrage fehlgeschlagen");
  },
});
poller.start();

// ---------------------------------------------------------------- HTTP

await app.register(fastifyWebsocket, { options: { maxPayload: 64 * 1024 } });

const TOKEN_COOKIE = "ruumble_token";
const cookieOf = (header: string | undefined, name: string) =>
  header?.split(";").map((c) => c.trim().split("=")).find(([k]) => k === name)?.[1];

function wire(socket: WebSocket, handler: { onMessage(raw: string): unknown; onClose(): void }) {
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
  if (!token) return reply.code(400).type("text/html; charset=utf-8").send("<p>Der Kopplungslink ist ungültig oder abgelaufen. Verbinde Mumble neu, um einen neuen zu erhalten.</p>");
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

app.get("/healthz", async (_req, reply) => {
  const healthy = Date.now() - lastPoll < 10_000;
  return reply.code(healthy ? 200 : 503).send({ ice: healthy ? "ok" : "stale", lastPoll: lastPoll ? new Date(lastPoll).toISOString() : null, lastError, plugins: hub.pluginCount });
});

if (config.pluginBundle && existsSync(config.pluginBundle)) {
  const file = config.pluginBundle;
  app.get("/download", async (_req, reply) =>
    reply.header("Content-Disposition", `attachment; filename="${basename(file)}"`).sendFile(basename(file), resolve(file, "..")),
  );
}

if (existsSync(config.webDist)) {
  await app.register(fastifyStatic, { root: config.webDist, wildcard: false });
} else {
  app.log.warn({ webDist: config.webDist }, "Oberfläche nicht gefunden (pnpm -F @ruumble/web build)");
}

await app.listen({ port: config.port, host: config.host });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    poller.stop();
    await app.close();
    await source.close();
    process.exit(0);
  });
}
