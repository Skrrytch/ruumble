/**
 * WebSocket keepalive: a ping every 30 s keeps idle connections open behind a reverse proxy
 * (nginx closes them after 60 s without traffic). A connection that has not answered the previous
 * ping with a pong is dead (e.g. a laptop gone to sleep) and is terminated, which triggers its `close`.
 * Browsers and IXWebSocket (plugin) answer pings on their own.
 */

export const KEEPALIVE_MS = 30_000;

/** The part of a `ws` WebSocket that the keepalive needs */
export interface PingSocket {
  ping(): void;
  terminate(): void;
  on(event: "pong" | "close", listener: () => void): unknown;
}

export function keepAlive(socket: PingSocket, intervalMs = KEEPALIVE_MS): () => void {
  let alive = true;
  socket.on("pong", () => (alive = true));
  const timer = setInterval(() => {
    if (!alive) {
      stop();
      socket.terminate();
      return;
    }
    alive = false;
    try {
      socket.ping();
    } catch {
      /* socket is closing; its close event stops the timer */
    }
  }, intervalMs);
  const stop = () => clearInterval(timer);
  socket.on("close", stop);
  return stop;
}
