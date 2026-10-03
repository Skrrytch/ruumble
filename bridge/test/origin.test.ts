import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { checkOrigin, originGuard } from "../src/origin.ts";

const req = (method: string, path: string, origin: string | undefined, host = "ruumble.example", publicUrl?: string) => checkOrigin({ method, path, origin, host, publicUrl });

describe("Origin check (ADR-0017)", () => {
  it("changing requests and /ws/ui only from the service's own address", () => {
    expect(req("POST", "/api/board/posts", "https://ruumble.example")).toBe("ok");
    expect(req("POST", "/api/board/posts", "https://ruumble.example:443")).toBe("ok");
    expect(req("DELETE", "/api/keys/abc", "https://evil.example")).toBe("foreign-origin");
    expect(req("POST", "/logout", "null")).toBe("foreign-origin");
    expect(req("GET", "/ws/ui", "https://other.ruumble.example")).toBe("foreign-origin");
    expect(req("GET", "/ws/ui", "http://localhost:5173", "localhost:5173")).toBe("ok"); // Vite dev proxy keeps the host
    // PUBLIC_URL counts as well, e.g. when the proxy rewrites Host
    expect(req("PUT", "/api/maintenance/settings", "https://ruumble.example", "ruumble:64080", "https://ruumble.example")).toBe("ok");
  });

  it("reading and requests without Origin pass", () => {
    expect(req("GET", "/api/board", "https://evil.example")).toBe("ok");
    expect(req("POST", "/api/pair/request", undefined)).toBe("ok");
  });

  it("a browser cannot pose as the plugin; the plugin's ws(s) origin passes", () => {
    expect(req("GET", "/ws/plugin", "https://evil.example")).toBe("browser-as-plugin");
    expect(req("GET", "/ws/plugin", "http://ruumble.example")).toBe("browser-as-plugin");
    expect(req("GET", "/ws/plugin", "wss://ruumble.example:443")).toBe("ok"); // IXWebSocket
    expect(req("GET", "/ws/plugin", undefined)).toBe("ok");
  });

  it("the hook turns away before routes and WebSocket upgrades", async () => {
    const app = Fastify();
    await app.register(fastifyWebsocket);
    app.addHook("onRequest", originGuard(undefined));
    let opened = 0;
    app.get("/ws/plugin", { websocket: true }, (socket) => {
      opened++;
      socket.close();
    });
    app.post("/logout", async () => ({ ok: true }));
    await app.ready();
    expect((await app.inject({ method: "POST", url: "/logout", headers: { host: "r.test", origin: "https://evil.example" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/logout", headers: { host: "r.test", origin: "http://r.test" } })).statusCode).toBe(200);
    await expect(app.injectWS("/ws/plugin", { headers: { origin: "https://evil.example" } })).rejects.toThrow();
    const ws = await app.injectWS("/ws/plugin", { headers: { origin: "wss://r.test:443" } });
    ws.terminate();
    expect(opened).toBe(1);
    await app.close();
  });
});
