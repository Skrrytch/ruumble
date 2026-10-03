/**
 * LiveAdapter: WebSocket to the Ruumble service (`/ws/ui`, ADR-0007).
 * Reconnects with increasing delay after a drop. Results are matched to commands by ID.
 */
import { BoardError, BoardView, BridgeToUi, BuildingCare, CareDone, FloorCare, KeyCabinet, RoomCare, PROTOCOL_VERSION, PairError, PairRequested, Pinned, Post, Uploaded, Versions, parse, type CommandBody, type CommandResult, type Parser } from "@ruumble/protocol";
import type { AdapterEvents, BoardApi, BoardErrorCode, CareApi, KeysApi, BoardResult, MumbleAdapter, PairApi, PairResult } from "./types.ts";

/** REST of the board; the pairing cookie is sent automatically (same-origin) */
async function call<T>(schema: Parser<T> | null, url: string, init: RequestInit = {}): Promise<BoardResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", ...init, headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers } });
  } catch {
    return { ok: false, error: "offline" };
  }
  if (res.status === 204) return { ok: true, value: true as T };
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const known = BoardError.safeParse(body);
    return { ok: false, error: known.success ? known.data.error : (STATUS_ERROR[res.status] ?? "invalid") };
  }
  const parsed = schema ? schema.safeParse(body) : { success: true as const, data: body as T };
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "invalid" };
}

const liveBoard: BoardApi = {
  load: () => call(BoardView, "/api/board"),
  create: (post) => call(Post, "/api/board/posts", { method: "POST", body: JSON.stringify(post) }),
  update: (id, change) => call(Post, `/api/board/posts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(change) }),
  remove: (id) => call<true>(null, `/api/board/posts/${encodeURIComponent(id)}`, { method: "DELETE" }),
  copy: (id, channelId) => call(Post, `/api/board/posts/${encodeURIComponent(id)}/copy`, { method: "POST", body: JSON.stringify({ channelId }) }),
  pin: (postId, title) => call(Pinned, "/api/board/pin", { method: "PUT", body: JSON.stringify({ postId, title }) }),
  unpin: () => call<true>(null, "/api/board/pin", { method: "DELETE" }),
  toggleTask: (id, index, done) => call(Post, `/api/board/posts/${encodeURIComponent(id)}/tasks/${index}`, { method: "PUT", body: JSON.stringify({ done }) }),
  react: (id, kind, on) => call(Post, `/api/board/posts/${encodeURIComponent(id)}/reactions/${kind}`, { method: on ? "PUT" : "DELETE" }),
  upload,
  fileUrl: (a, download = false) => `/api/board/files/${a.id}${download ? "?download" : ""}`,
};

const liveCare: CareApi = {
  room: (id) => call(RoomCare, `/api/care/rooms/${id}`),
  clearRoom: (id) => call(CareDone, `/api/care/rooms/${id}/posts`, { method: "DELETE" }),
  pruneRoom: (id, days) => call(CareDone, `/api/care/rooms/${id}/prune`, { method: "POST", body: JSON.stringify({ days }) }),
  exportRoom: (id) => download(`/api/care/rooms/${id}/export`),
  floor: (id) => call(FloorCare, `/api/care/floors/${id}`),
  cleanFloor: (id, rooms) => call(CareDone, `/api/care/floors/${id}/cleanup`, { method: "POST", body: JSON.stringify({ rooms }) }),
  transfer: (id, from, to) => call(CareDone, `/api/care/floors/${id}/transfer`, { method: "POST", body: JSON.stringify({ from, to }) }),
  building: () => call(BuildingCare, "/api/care/building"),
  cleanBuilding: (floors) => call(CareDone, "/api/care/building/cleanup", { method: "POST", body: JSON.stringify({ floors }) }),
  forgetTickets: (projects) => call<true>(null, "/api/care/building/tickets/forget", { method: "POST", body: JSON.stringify({ projects }) }),
};

const liveKeys: KeysApi = {
  list: () => call(KeyCabinet, "/api/keys"),
  revoke: (id) => call<true>(null, `/api/keys/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

/** a file from the service (export): the content and the name from Content-Disposition */
async function download(url: string): Promise<BoardResult<{ blob: Blob; name: string }>> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin" });
  } catch {
    return { ok: false, error: "offline" };
  }
  if (!res.ok) {
    const known = BoardError.safeParse(await res.json().catch(() => null));
    return { ok: false, error: known.success ? known.data.error : (STATUS_ERROR[res.status] ?? "invalid") };
  }
  const encoded = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get("content-disposition") ?? "")?.[1];
  return { ok: true, value: { blob: await res.blob(), name: encoded ? decodeURIComponent(encoded) : "board.zip" } };
}

/** Errors that Fastify reports itself (e.g. body too large) have no code of their own */
const STATUS_ERROR: Record<number, BoardErrorCode> = { 401: "not-paired", 403: "not-in-room", 404: "no-board-here", 413: "too-large", 415: "bad-type", 429: "rate-limited" };

/** XMLHttpRequest instead of fetch, because only it reports upload progress */
function upload(file: Blob, name: string, onProgress?: (fraction: number) => void): Promise<BoardResult<Uploaded>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/board/uploads");
    xhr.withCredentials = true;
    // always raw data: Fastify would otherwise parse JSON and text itself; the real type goes in X-File-Type
    xhr.setRequestHeader("content-type", "application/octet-stream");
    if (file.type) xhr.setRequestHeader("x-file-type", file.type);
    xhr.setRequestHeader("x-file-name", encodeURIComponent(name));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onerror = () => resolve({ ok: false, error: "offline" });
    xhr.onload = () => {
      let body: unknown = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status !== 201) {
        const known = BoardError.safeParse(body);
        return resolve({ ok: false, error: known.success ? known.data.error : (STATUS_ERROR[xhr.status] ?? "invalid") });
      }
      const parsed = Uploaded.safeParse(body);
      resolve(parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "invalid" });
    };
    xhr.send(file);
  });
}

/** POST to /api/pair/*; errors come as `{ error }` */
async function pairCall(url: string, body?: unknown): Promise<PairResult<unknown>> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", credentials: "same-origin", ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  } catch {
    return { ok: false, error: "offline" };
  }
  const json: unknown = await res.json().catch(() => null);
  if (res.ok) return { ok: true, value: json };
  const known = PairError.safeParse(json);
  return { ok: false, error: known.success ? known.data.error : "invalid" };
}

/** Without a reply from the plugin, a command counts as `timeout` after this time (plugin: 3 s + retry). */
const COMMAND_TIMEOUT_MS = 10_000;

export class LiveAdapter implements MumbleAdapter {
  private readonly url: string;
  private events: AdapterEvents | null = null;
  private socket: WebSocket | null = null;
  private retryMs = 500;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pending = new Map<string, { resolve: (r: CommandResult) => void; timer: ReturnType<typeof setTimeout> }>();
  private nextId = 1;
  readonly board: BoardApi = liveBoard;
  readonly care: CareApi = liveCare;
  readonly keys: KeysApi = liveKeys;
  readonly pairing: PairApi = {
    request: async () => {
      const r = await pairCall("/api/pair/request");
      if (!r.ok) return r;
      const parsed = PairRequested.safeParse(r.value);
      return parsed.success ? { ok: true, value: parsed.data.request } : { ok: false, error: "invalid" };
    },
    confirm: async (request, code) => {
      const r = await pairCall("/api/pair/confirm", { request, code });
      if (!r.ok) return r;
      // the cookie is set now: connect again (after 4401 the adapter had stopped)
      if (this.events && this.socket?.readyState !== WebSocket.OPEN) this.open();
      return { ok: true, value: true };
    },
  };

  constructor(url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/ui`) {
    this.url = url;
  }

  start(events: AdapterEvents): void {
    this.events = events;
    this.open();
  }

  stop(): void {
    this.events = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close();
  }

  async versions(): Promise<Versions | null> {
    const r = await call(Versions, "/api/version");
    return r.ok ? r.value : null;
  }

  command(body: CommandBody): Promise<CommandResult> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.resolve("offline");
    const id = `c${this.nextId++}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve("timeout");
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(id, { resolve, timer });
      socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: "command", id, body }));
    });
  }

  private open(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => (this.retryMs = 500);
    socket.onmessage = (e) => {
      const msg = parse(BridgeToUi, String(e.data));
      if (!msg || !this.events) return;
      switch (msg.type) {
        case "snapshot":
          return this.events.snapshot(msg);
        case "talking":
          return this.events.talking(msg.session, msg.state);
        case "status":
          return this.events.status(msg.plugin, msg.preview ?? false);
        case "board":
          return this.events.board(msg.channelId);
        case "result": {
          const p = this.pending.get(msg.id);
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(msg.id);
            p.resolve(msg.result);
          }
        }
      }
    };
    socket.onclose = (e) => {
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.resolve("offline");
        this.pending.delete(id);
      }
      if (!this.events) return;
      if (e.code === 4401) return this.events.connection("unpaired"); // not paired: no retry
      this.events.connection("reconnecting");
      this.retryTimer = setTimeout(() => this.open(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 10_000);
    };
  }
}
