/**
 * Board REST API (ADR-0011). Everything only for paired users currently present in the room.
 *
 *   GET    /api/board                 board of the current room
 *   POST   /api/board/posts           text/code or image/file (with attachmentId)
 *   POST   /api/board/uploads         raw data up to 10 MB, headers X-File-Name (URI-encoded), X-File-Type (else Content-Type)
 *   PATCH  /api/board/posts/:id       edit (everyone present)
 *   DELETE /api/board/posts/:id       delete (author or Mumble admin)
 *   PUT    /api/board/pin                          keep a post on top { postId, title } (A3, everyone present, replaces)
 *   DELETE /api/board/pin                          remove it from the top
 *   PUT    /api/board/posts/:id/tasks/:index      tick or untick one task of a task list (A2, everyone present)
 *   PUT    /api/board/posts/:id/reactions/:kind   set a quick reaction (A1, everyone present)
 *   DELETE /api/board/posts/:id/reactions/:kind   take it back
 *   GET    /api/board/files/:id       attachment (images inline, everything else as download)
 */
import { createReadStream } from "node:fs";
import type { FastifyInstance, FastifyReply } from "fastify";
import { BOARD_LIMITS, NewPost, PinRequest, PostUpdate, REACTION_KINDS, ReactionKind, TaskToggle, setTask, ticketProjects, type BoardView, type Post, type Reaction, type TicketLinks } from "@ruumble/protocol";
import type { Hub, Viewer } from "../hub.ts";
import type { MumbleSource } from "../mumble.ts";
import { detectImage, imageSize, safeFileName } from "./media.ts";
import type { BoardStore, StoredPost } from "./store.ts";

export interface BoardRouteOptions {
  store: BoardStore;
  hub: Hub;
  source: Pick<MumbleSource, "canWrite">;
  /** device token from the cookie → certificate hash */
  certHashOf: (cookieHeader: string | undefined) => string | null;
  /** after pinning: notice to the plugins of those present (AP11.4) */
  onNewPost?: (post: StoredPost, viewer: Viewer) => void;
  /** write operations per user and minute */
  writesPerMinute?: number;
}

type ErrorCode = "not-paired" | "not-in-room" | "no-board-here" | "not-found" | "forbidden" | "too-large" | "bad-type" | "invalid" | "rate-limited";
const STATUS: Record<ErrorCode, number> = {
  "not-paired": 401, "not-in-room": 403, "no-board-here": 404, "not-found": 404, forbidden: 403, "too-large": 413, "bad-type": 415, invalid: 400, "rate-limited": 429,
};
const fail = (reply: FastifyReply, error: ErrorCode) => reply.code(STATUS[error]).send({ error });

/** per kind in the fixed order: count, names at the time (oldest first) and whether the viewer is among them */
function aggregate(post: StoredPost, viewerHash: string): Reaction[] {
  return REACTION_KINDS.flatMap((kind) => {
    const of = post.reactions.filter((r) => r.kind === kind);
    return of.length ? [{ kind, count: of.length, names: of.map((r) => r.authorName), mine: of.some((r) => r.authorHash === viewerHash) }] : [];
  });
}

export async function boardRoutes(app: FastifyInstance, o: BoardRouteOptions): Promise<void> {
  const writes = new Map<string, number[]>();
  const limit = o.writesPerMinute ?? 30;

  /** identify the user and check that they are in a room with a board */
  function room(cookie: string | undefined): { viewer: Viewer } | { error: ErrorCode } {
    const certHash = o.certHashOf(cookie);
    if (!certHash) return { error: "not-paired" };
    const viewer = o.hub.whoIs(certHash);
    if (!viewer) return { error: "not-paired" }; // paired, but Mumble currently not connected
    if (!o.hub.isBoardRoom(viewer.channelId)) return { error: "no-board-here" };
    return { viewer };
  }

  function rateLimited(certHash: string): boolean {
    const now = Date.now();
    const list = (writes.get(certHash) ?? []).filter((t) => now - t < 60_000);
    if (list.length >= limit) return true;
    list.push(now);
    writes.set(certHash, list);
    return false;
  }

  /** `isAdmin`: Mumble write permission in the post's room (queried once per request) */
  function toView(p: StoredPost, viewer: Viewer, isAdmin: boolean): Post {
    const mine = p.authorHash === viewer.certHash;
    return {
      id: p.id, channelId: p.channelId, kind: p.kind, text: p.text,
      ...(p.language ? { language: p.language } : {}),
      ...(p.attachment ? { attachment: p.attachment } : {}),
      authorName: p.authorName, mine,
      canDelete: mine || isAdmin,
      createdAt: p.createdAt, updatedAt: p.updatedAt,
      ...(p.updatedByName ? { updatedByName: p.updatedByName } : {}),
      reactions: aggregate(p, viewer.certHash),
    };
  }

  app.get("/api/board", async (req, reply) => {
    const r = room(req.headers.cookie);
    if ("error" in r) return fail(reply, r.error);
    const { viewer } = r;
    const isAdmin = await o.source.canWrite(viewer.session, viewer.channelId);
    const stored = o.store.list(viewer.channelId);
    const posts = stored.map((p) => toView(p, viewer, isAdmin));
    // only projects mentioned in this room: which projects other rooms link stays there
    const learned = o.store.ticketLinks();
    const tickets: TicketLinks = {};
    for (const project of ticketProjects(stored.map((p) => p.text).join("\n"))) if (Object.hasOwn(learned, project)) tickets[project] = learned[project]!;
    const view: BoardView = { channelId: viewer.channelId, channelName: o.hub.channelName(viewer.channelId), posts, pinned: o.store.pinned(viewer.channelId), tickets };
    return view;
  });

  app.post("/api/board/posts", async (req, reply) => {
    const r = room(req.headers.cookie);
    if ("error" in r) return fail(reply, r.error);
    const { viewer } = r;
    const body = NewPost.safeParse(req.body);
    if (!body.success) return fail(reply, "invalid");
    const input = body.data;
    if (rateLimited(viewer.certHash)) return fail(reply, "rate-limited");
    let attachmentName: string | undefined;
    if (input.kind === "image" || input.kind === "file") {
      const att = input.attachmentId ? o.store.attachment(input.attachmentId) : null;
      if (!att) return fail(reply, "invalid");
      if (input.kind === "image" && !att.mime.startsWith("image/")) return fail(reply, "bad-type");
      attachmentName = safeFileName(input.attachmentName);
    } else if (input.attachmentId || !input.text.trim()) {
      return fail(reply, "invalid");
    }
    const post = o.store.create({
      channelId: viewer.channelId, kind: input.kind, text: input.text,
      ...(input.language ? { language: input.language } : {}),
      ...(input.attachmentId ? { attachmentId: input.attachmentId, attachmentName } : {}),
      authorHash: viewer.certHash, authorName: viewer.name,
    });
    o.hub.boardChanged(viewer.channelId);
    o.onNewPost?.(post, viewer);
    return reply.code(201).send(toView(post, viewer, await o.source.canWrite(viewer.session, viewer.channelId)));
  });

  // raw data upload (images and files), own limit instead of the global 1 MB
  app.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: BOARD_LIMITS.fileBytes }, (_req, body, done) => done(null, body));
  app.post("/api/board/uploads", { bodyLimit: BOARD_LIMITS.fileBytes }, async (req, reply) => {
    const r = room(req.headers.cookie);
    if ("error" in r) return fail(reply, r.error);
    if (rateLimited(r.viewer.certHash)) return fail(reply, "rate-limited");
    const bytes = req.body;
    if (!(bytes instanceof Buffer) || bytes.length === 0) return fail(reply, "invalid");
    // always check the image type from the bytes; SVG and everything else counts as a file (never inline, ADR-0011)
    const imageMime = detectImage(bytes);
    // The web UI always sends application/octet-stream (otherwise Fastify's JSON and text parsers kick in)
    // and the actual type in X-File-Type
    const declared = String(req.headers["x-file-type"] || req.headers["content-type"] || "application/octet-stream").split(";")[0]!.trim().toLowerCase();
    const mime = imageMime ?? (/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(declared) && !declared.startsWith("image/") ? declared : "application/octet-stream");
    const dims = imageMime ? imageSize(bytes, imageMime) : null;
    const att = o.store.putFile(bytes, mime, dims ?? undefined);
    return reply.code(201).send({ ...att, name: safeFileName(req.headers["x-file-name"] as string | undefined), image: !!imageMime });
  });

  app.patch<{ Params: { id: string } }>("/api/board/posts/:id", async (req, reply) => {
    const r = room(req.headers.cookie);
    if ("error" in r) return fail(reply, r.error);
    const post = o.store.get(req.params.id);
    if (!post) return fail(reply, "not-found");
    if (post.channelId !== r.viewer.channelId) return fail(reply, "not-in-room");
    const body = PostUpdate.safeParse(req.body);
    if (!body.success || ((post.kind === "text" || post.kind === "code") && !body.data.text.trim())) return fail(reply, "invalid");
    if (rateLimited(r.viewer.certHash)) return fail(reply, "rate-limited");
    const updated = o.store.update(post.id, { text: body.data.text, ...(body.data.language ? { language: body.data.language } : {}) }, r.viewer.name)!;
    o.hub.boardChanged(post.channelId);
    return toView(updated, r.viewer, await o.source.canWrite(r.viewer.session, post.channelId));
  });

  app.delete<{ Params: { id: string } }>("/api/board/posts/:id", async (req, reply) => {
    const r = room(req.headers.cookie);
    if ("error" in r) return fail(reply, r.error);
    const post = o.store.get(req.params.id);
    if (!post) return fail(reply, "not-found");
    if (post.channelId !== r.viewer.channelId) return fail(reply, "not-in-room");
    const allowed = post.authorHash === r.viewer.certHash || (await o.source.canWrite(r.viewer.session, post.channelId));
    if (!allowed) return fail(reply, "forbidden");
    o.store.delete(post.id);
    o.hub.boardChanged(post.channelId);
    return reply.code(204).send();
  });

  // kept on top (A3): one post per room, everyone present may set, replace and remove it; no Mumble notice
  app.put("/api/board/pin", async (req, reply) => {
    const r = room(req.headers.cookie);
    if ("error" in r) return fail(reply, r.error);
    const body = PinRequest.safeParse(req.body);
    if (!body.success) return fail(reply, "invalid");
    if (rateLimited(r.viewer.certHash)) return fail(reply, "rate-limited");
    if (!o.store.pin(r.viewer.channelId, body.data.postId, body.data.title, r.viewer.name)) return fail(reply, "not-found");
    o.hub.boardChanged(r.viewer.channelId);
    return o.store.pinned(r.viewer.channelId);
  });
  app.delete("/api/board/pin", async (req, reply) => {
    const r = room(req.headers.cookie);
    if ("error" in r) return fail(reply, r.error);
    if (rateLimited(r.viewer.certHash)) return fail(reply, "rate-limited");
    o.store.unpin(r.viewer.channelId);
    o.hub.boardChanged(r.viewer.channelId);
    return reply.code(204).send();
  });

  // task lists (A2): only "task N done / not done", the service changes exactly that line. Read, change and
  // write run without an await in between, so two people ticking at the same time do not overwrite each other.
  // Counts as an edit ("last edited by"), no Mumble notice.
  app.put<{ Params: { id: string; index: string } }>("/api/board/posts/:id/tasks/:index", async (req, reply) => {
    const r = room(req.headers.cookie);
    if ("error" in r) return fail(reply, r.error);
    const body = TaskToggle.safeParse(req.body);
    if (!body.success || !/^\d{1,4}$/.test(req.params.index)) return fail(reply, "invalid");
    const post = o.store.get(req.params.id);
    if (!post) return fail(reply, "not-found");
    if (post.channelId !== r.viewer.channelId) return fail(reply, "not-in-room");
    if (rateLimited(r.viewer.certHash)) return fail(reply, "rate-limited");
    const text = post.kind === "text" ? setTask(post.text, Number(req.params.index), body.data.done) : null;
    if (text === null) return fail(reply, "invalid"); // not a task list (any more) or no such task
    // already in that state (e.g. two people ticked the same task): no edit
    const updated = text === post.text ? post : o.store.update(post.id, { text, ...(post.language ? { language: post.language } : {}) }, r.viewer.name)!;
    if (updated !== post) o.hub.boardChanged(post.channelId);
    return toView(updated, r.viewer, await o.source.canWrite(r.viewer.session, post.channelId));
  });

  // quick reactions (A1): no Mumble notice and no "edited by"; those present reload the board
  const reactRoute = (on: boolean) => async (req: { params: { id: string; kind: string }; headers: { cookie?: string } }, reply: FastifyReply) => {
    const r = room(req.headers.cookie);
    if ("error" in r) return fail(reply, r.error);
    const kind = ReactionKind.safeParse(req.params.kind);
    if (!kind.success) return fail(reply, "invalid");
    const post = o.store.get(req.params.id);
    if (!post) return fail(reply, "not-found");
    if (post.channelId !== r.viewer.channelId) return fail(reply, "not-in-room");
    if (rateLimited(r.viewer.certHash)) return fail(reply, "rate-limited");
    o.store.react(post.id, kind.data, on, { hash: r.viewer.certHash, name: r.viewer.name });
    o.hub.boardChanged(post.channelId);
    return toView(o.store.get(post.id)!, r.viewer, await o.source.canWrite(r.viewer.session, post.channelId));
  };
  app.put<{ Params: { id: string; kind: string } }>("/api/board/posts/:id/reactions/:kind", reactRoute(true));
  app.delete<{ Params: { id: string; kind: string } }>("/api/board/posts/:id/reactions/:kind", reactRoute(false));

  app.get<{ Params: { id: string }; Querystring: { download?: string } }>("/api/board/files/:id", async (req, reply) => {
    const r = room(req.headers.cookie);
    if ("error" in r) return fail(reply, r.error);
    if (!/^[0-9a-f]{64}$/.test(req.params.id)) return fail(reply, "not-found");
    // only attachments of posts in the current room
    const post = o.store.list(r.viewer.channelId).find((p) => p.attachment?.id === req.params.id);
    if (!post?.attachment) return fail(reply, "not-found");
    const a = post.attachment;
    const inline = a.mime.startsWith("image/") && req.query.download === undefined;
    const name = encodeURIComponent(a.name || "file");
    return reply
      .header("Content-Type", a.mime)
      .header("Content-Length", a.size)
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "private, max-age=3600")
      .header("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`)
      .send(createReadStream(o.store.filePath(a.id)));
  });
}
