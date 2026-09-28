/**
 * REST der Pinnwand (ADR-0011). Alles nur für gekoppelte Nutzer, die gerade im Raum anwesend sind.
 *
 *   GET    /api/board                 Pinnwand des aktuellen Raums
 *   POST   /api/board/posts           Text/Code oder Bild/Datei (mit attachmentId)
 *   POST   /api/board/uploads         Rohdaten bis 10 MB, Header X-File-Name (URI-kodiert), X-File-Type (sonst Content-Type)
 *   PATCH  /api/board/posts/:id       bearbeiten (alle Anwesenden)
 *   DELETE /api/board/posts/:id       löschen (Autor oder Mumble-Admin)
 *   GET    /api/board/files/:id       Anhang (Bilder inline, alles andere als Download)
 */
import { createReadStream } from "node:fs";
import type { FastifyInstance, FastifyReply } from "fastify";
import { BOARD_LIMITS, NewPost, PostUpdate, type BoardView, type Post } from "@ruumble/protocol";
import type { Hub, Viewer } from "../hub.ts";
import type { MumbleSource } from "../mumble.ts";
import { detectImage, imageSize, safeFileName } from "./media.ts";
import type { BoardStore, StoredPost } from "./store.ts";

export interface BoardRouteOptions {
  store: BoardStore;
  hub: Hub;
  source: Pick<MumbleSource, "canWrite">;
  /** Geräte-Token aus dem Cookie → Zertifikats-Hash */
  certHashOf: (cookieHeader: string | undefined) => string | null;
  /** nach dem Anheften: Hinweis an die Plugins der Anwesenden (AP11.4) */
  onNewPost?: (post: StoredPost, viewer: Viewer) => void;
  /** Schreibvorgänge je Nutzer und Minute */
  writesPerMinute?: number;
}

type ErrorCode = "not-paired" | "not-in-room" | "no-board-here" | "not-found" | "forbidden" | "too-large" | "bad-type" | "invalid" | "rate-limited";
const STATUS: Record<ErrorCode, number> = {
  "not-paired": 401, "not-in-room": 403, "no-board-here": 404, "not-found": 404, forbidden: 403, "too-large": 413, "bad-type": 415, invalid: 400, "rate-limited": 429,
};
const fail = (reply: FastifyReply, error: ErrorCode) => reply.code(STATUS[error]).send({ error });

export async function boardRoutes(app: FastifyInstance, o: BoardRouteOptions): Promise<void> {
  const writes = new Map<string, number[]>();
  const limit = o.writesPerMinute ?? 30;

  /** Nutzer ermitteln und prüfen, dass er in einem Raum mit Pinnwand steht */
  function room(cookie: string | undefined): { viewer: Viewer } | { error: ErrorCode } {
    const certHash = o.certHashOf(cookie);
    if (!certHash) return { error: "not-paired" };
    const viewer = o.hub.whoIs(certHash);
    if (!viewer) return { error: "not-paired" }; // gekoppelt, aber Mumble gerade nicht verbunden
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

  /** `isAdmin`: Mumble-Schreibrecht im Raum des Beitrags (je Anfrage einmal abgefragt) */
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
    };
  }

  app.get("/api/board", async (req, reply) => {
    const r = room(req.headers.cookie);
    if ("error" in r) return fail(reply, r.error);
    const { viewer } = r;
    const isAdmin = await o.source.canWrite(viewer.session, viewer.channelId);
    const posts = o.store.list(viewer.channelId).map((p) => toView(p, viewer, isAdmin));
    const view: BoardView = { channelId: viewer.channelId, channelName: o.hub.channelName(viewer.channelId), posts };
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

  // Rohdaten-Upload (Bilder und Dateien), eigene Grenze statt der globalen 1 MB
  app.addContentTypeParser("*", { parseAs: "buffer", bodyLimit: BOARD_LIMITS.fileBytes }, (_req, body, done) => done(null, body));
  app.post("/api/board/uploads", { bodyLimit: BOARD_LIMITS.fileBytes }, async (req, reply) => {
    const r = room(req.headers.cookie);
    if ("error" in r) return fail(reply, r.error);
    if (rateLimited(r.viewer.certHash)) return fail(reply, "rate-limited");
    const bytes = req.body;
    if (!(bytes instanceof Buffer) || bytes.length === 0) return fail(reply, "invalid");
    // Bildtyp immer an den Bytes prüfen; SVG und alles andere gilt als Datei (nie inline, ADR-0011)
    const imageMime = detectImage(bytes);
    // Die Oberfläche schickt immer application/octet-stream (sonst greifen Fastifys JSON- und Text-Parser)
    // und den eigentlichen Typ in X-File-Type
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

  app.get<{ Params: { id: string }; Querystring: { download?: string } }>("/api/board/files/:id", async (req, reply) => {
    const r = room(req.headers.cookie);
    if ("error" in r) return fail(reply, r.error);
    if (!/^[0-9a-f]{64}$/.test(req.params.id)) return fail(reply, "not-found");
    // nur Anhänge von Beiträgen des aktuellen Raums
    const post = o.store.list(r.viewer.channelId).find((p) => p.attachment?.id === req.params.id);
    if (!post?.attachment) return fail(reply, "not-found");
    const a = post.attachment;
    const inline = a.mime.startsWith("image/") && req.query.download === undefined;
    const name = encodeURIComponent(a.name || "datei");
    return reply
      .header("Content-Type", a.mime)
      .header("Content-Length", a.size)
      .header("X-Content-Type-Options", "nosniff")
      .header("Cache-Control", "private, max-age=3600")
      .header("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`)
      .send(createReadStream(o.store.filePath(a.id)));
  });
}
