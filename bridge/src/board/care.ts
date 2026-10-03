/**
 * Care of the stored data (ADR-0014): the plant in every room, at the end of the corridor and at the entrance.
 * Only for paired users with Mumble's Write permission on that room, floor or the root channel (building). Unlike
 * the board itself, care works from anywhere in the building. It shows counts and sizes, not the content of posts;
 * the export is the exception, for admins only.
 *
 *   GET    /api/care/rooms/:id           what the room's board holds, how many posts are older than each choice
 *   DELETE /api/care/rooms/:id/posts     clear the board (all posts with reactions, pin and attachments)
 *   POST   /api/care/rooms/:id/prune     { days } delete the posts older than that
 *   GET    /api/care/rooms/:id/export    the whole board as a ZIP (board.md and files/), the one place care reads content
 *   GET    /api/care/floors/:id          the floor's rooms, rooms that were here and are gone, boards that can be moved here
 *   POST   /api/care/floors/:id/cleanup  { rooms } remove gone rooms with all their data
 *   POST   /api/care/floors/:id/transfer { from, to } move the board of any room to a room on this floor
 *   GET    /api/care/building            storage use, the floors, floors that are gone, all learned ticket links
 *   POST   /api/care/building/cleanup    { floors } remove them with all their data (null: rooms of an unknown floor)
 *   POST   /api/care/building/tickets/forget  { projects } forget their learned links (they are building-wide)
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { BuildingCleanup, FloorCleanup, FloorTransfer, PRUNE_DAYS, RoomPrune, TicketsForget, type BuildingCare, type CareDone, type FloorCare, type FloorSummary, type OrphanedFloor, type RoomCare, type TicketLinks, type TransferSource } from "@ruumble/protocol";
import type { Hub, Viewer } from "../hub.ts";
import type { MumbleSource } from "../mumble.ts";
import { exportBoard } from "./export.ts";
import type { CareChange } from "./notify.ts";
import type { BoardStore, OrphanedRoom } from "./store.ts";

const DAY = 24 * 60 * 60 * 1000;

export interface CareRouteOptions {
  store: BoardStore;
  hub: Hub;
  source: Pick<MumbleSource, "canWrite">;
  certHashOf: (cookieHeader: string | undefined) => string | null;
  /** after care changed a board: notice to the people present */
  onChanged?: (channelId: number, viewer: Viewer, change: CareChange) => void;
  now?: () => number;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
  /** care actions per user and minute */
  actionsPerMinute?: number;
}

type ErrorCode = "not-paired" | "not-found" | "forbidden" | "invalid" | "rate-limited";
const STATUS: Record<ErrorCode, number> = { "not-paired": 401, "not-found": 404, forbidden: 403, invalid: 400, "rate-limited": 429 };
const fail = (reply: FastifyReply, error: ErrorCode) => reply.code(STATUS[error]).send({ error });

/** floors that are gone, from the rooms that are gone: grouped by their last known floor */
export function orphanedFloors(rooms: OrphanedRoom[], isFloor: (id: number) => boolean, floorName: (id: number) => string): OrphanedFloor[] {
  const groups = new Map<number | null, OrphanedRoom[]>();
  for (const r of rooms) {
    if (r.floorId !== null && isFloor(r.floorId)) continue; // the floor is still there: floor care
    groups.set(r.floorId, [...(groups.get(r.floorId) ?? []), r]);
  }
  return [...groups].map(([id, list]) => {
    const gone = list.flatMap((r) => (r.goneSince === null ? [] : [r.goneSince]));
    return {
      channelId: id,
      name: id === null ? "" : floorName(id),
      rooms: list.length,
      posts: list.reduce((n, r) => n + r.posts, 0),
      bytes: list.reduce((n, r) => n + r.bytes, 0),
      goneSince: gone.length ? Math.min(...gone) : null,
    };
  });
}

export async function careRoutes(app: FastifyInstance, o: CareRouteOptions): Promise<void> {
  const actions = new Map<string, number[]>();
  const limit = o.actionsPerMinute ?? 20;

  /** paired, Mumble connected, Write permission on the channel; `exists` checks that it is a room/floor */
  async function caretaker(cookie: string | undefined, channelId: number, exists: boolean): Promise<{ viewer: Viewer } | { error: ErrorCode }> {
    const viewer = o.hub.whoIs(o.certHashOf(cookie));
    if (!viewer) return { error: "not-paired" };
    if (!exists) return { error: "not-found" };
    if (!(await o.source.canWrite(viewer.session, channelId))) return { error: "forbidden" };
    return { viewer };
  }

  function rateLimited(certHash: string): boolean {
    const now = Date.now();
    const list = (actions.get(certHash) ?? []).filter((t) => now - t < 60_000);
    if (list.length >= limit) return true;
    list.push(now);
    actions.set(certHash, list);
    return false;
  }

  const channelParam = (raw: string) => (/^\d{1,9}$/.test(raw) ? Number(raw) : -1);
  const now = o.now ?? Date.now;

  /** name of a room or floor: current, else last known */
  const nameOf = (id: number) => o.hub.channelName(id) || o.store.placeName(id);

  /** the floor whose Write permission covers a room's data: current floor, else last known, else the root channel */
  const floorFor = (id: number) => o.hub.floorOf(id) ?? o.store.placeFloor(id) ?? 0;

  // ---------------------------------------------------------------- Room

  app.get<{ Params: { id: string } }>("/api/care/rooms/:id", async (req, reply) => {
    const id = channelParam(req.params.id);
    const r = await caretaker(req.headers.cookie, id, o.hub.isBoardRoom(id));
    if ("error" in r) return fail(reply, r.error);
    const times = o.store.postTimes(id);
    const t = now();
    const view: RoomCare = {
      channelId: id, name: o.hub.channelName(id), ...o.store.roomStats(id),
      newest: times.at(-1) ?? null, oldest: times[0] ?? null,
      retentionDays: o.store.retentionDays,
      olderThan: PRUNE_DAYS.map((days) => ({ days, posts: times.filter((c) => c < t - days * DAY).length })),
    };
    return view;
  });

  app.post<{ Params: { id: string } }>("/api/care/rooms/:id/prune", async (req, reply) => {
    const id = channelParam(req.params.id);
    const r = await caretaker(req.headers.cookie, id, o.hub.isBoardRoom(id));
    if ("error" in r) return fail(reply, r.error);
    const body = RoomPrune.safeParse(req.body);
    if (!body.success) return fail(reply, "invalid");
    if (rateLimited(r.viewer.certHash)) return fail(reply, "rate-limited");
    const { days } = body.data;
    const posts = o.store.pruneRoom(id, now() - days * DAY);
    o.log?.("Old posts removed", { channel: id, days, posts, by: r.viewer.name });
    if (posts) {
      o.hub.boardChanged(id);
      o.onChanged?.(id, r.viewer, { kind: "pruned", days });
    }
    const done: CareDone = { posts };
    return done;
  });

  app.get<{ Params: { id: string } }>("/api/care/rooms/:id/export", async (req, reply) => {
    const id = channelParam(req.params.id);
    const r = await caretaker(req.headers.cookie, id, o.hub.isBoardRoom(id));
    if ("error" in r) return fail(reply, r.error);
    if (rateLimited(r.viewer.certHash)) return fail(reply, "rate-limited");
    const name = o.hub.channelName(id);
    const archive = exportBoard(o.store, id, name, now());
    o.log?.("Board exported", { channel: id, bytes: archive.length, by: r.viewer.name });
    const file = `board-${name.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || id}-${new Date(now()).toISOString().slice(0, 10)}.zip`;
    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file)}`)
      .header("Cache-Control", "no-store")
      .send(archive);
  });

  app.delete<{ Params: { id: string } }>("/api/care/rooms/:id/posts", async (req, reply) => {
    const id = channelParam(req.params.id);
    const r = await caretaker(req.headers.cookie, id, o.hub.isBoardRoom(id));
    if ("error" in r) return fail(reply, r.error);
    if (rateLimited(r.viewer.certHash)) return fail(reply, "rate-limited");
    const posts = o.store.clearRoom(id);
    o.log?.("Board cleared", { channel: id, posts, by: r.viewer.name });
    if (posts) {
      o.hub.boardChanged(id);
      o.onChanged?.(id, r.viewer, { kind: "cleared" });
    }
    const done: CareDone = { posts };
    return done;
  });

  // ---------------------------------------------------------------- Floor

  const floorOrphans = (floorId: number) => o.store.orphanedRooms().filter((r) => r.floorId === floorId);

  app.get<{ Params: { id: string } }>("/api/care/floors/:id", async (req, reply) => {
    const id = channelParam(req.params.id);
    const r = await caretaker(req.headers.cookie, id, o.hub.isFloor(id));
    if ("error" in r) return fail(reply, r.error);
    const stats = o.store.channelStats();
    const rooms = o.hub.floorPlan().find((f) => f.id === id)?.rooms ?? [];
    const view: FloorCare = {
      channelId: id,
      name: o.hub.channelName(id),
      rooms: rooms.map((room) => {
        const st = stats.get(room.id);
        return { channelId: room.id, name: room.name, posts: st?.posts ?? 0, bytes: st?.bytes ?? 0, newest: st?.newest ?? null };
      }),
      orphans: floorOrphans(id).map(({ channelId, name, posts, bytes, goneSince }) => ({ channelId, name, posts, bytes, goneSince })),
      sources: await transferSources(r.viewer, stats),
    };
    return view;
  });

  /** every room in the database with posts whose floor (or, unknown, the building) the viewer may tend */
  async function transferSources(viewer: Viewer, stats: Map<number, { posts: number }>): Promise<TransferSource[]> {
    const allowed = new Map<number, Promise<boolean>>();
    const may = (floor: number) => {
      if (!allowed.has(floor)) allowed.set(floor, o.source.canWrite(viewer.session, floor));
      return allowed.get(floor)!;
    };
    const list: TransferSource[] = [];
    for (const [id, st] of stats) {
      const floor = floorFor(id);
      if (!(await may(floor))) continue;
      list.push({ channelId: id, name: nameOf(id) || `#${id}`, floorName: floor === 0 ? "" : nameOf(floor), posts: st.posts, gone: !o.hub.isBoardRoom(id) });
    }
    return list.sort((a, b) => a.floorName.localeCompare(b.floorName, "de") || a.name.localeCompare(b.name, "de"));
  }

  // move a board (e.g. a room recreated in Mumble with a new ID): Write on this floor and on the source's floor
  app.post<{ Params: { id: string } }>("/api/care/floors/:id/transfer", async (req, reply) => {
    const id = channelParam(req.params.id);
    const r = await caretaker(req.headers.cookie, id, o.hub.isFloor(id));
    if ("error" in r) return fail(reply, r.error);
    const body = FloorTransfer.safeParse(req.body);
    if (!body.success) return fail(reply, "invalid");
    const { from, to } = body.data;
    if (o.hub.floorOf(to) !== id || from === to) return fail(reply, "invalid");
    if (!o.store.channelStats().has(from)) return fail(reply, "not-found");
    if (!(await o.source.canWrite(r.viewer.session, floorFor(from)))) return fail(reply, "forbidden");
    if (rateLimited(r.viewer.certHash)) return fail(reply, "rate-limited");
    const fromName = nameOf(from);
    const posts = o.store.moveRoom(from, to);
    o.log?.("Board moved", { from, to, posts, by: r.viewer.name });
    o.hub.boardChanged(from);
    o.hub.boardChanged(to);
    o.onChanged?.(to, r.viewer, { kind: "moved", posts, from: fromName });
    const done: CareDone = { posts };
    return done;
  });

  app.post<{ Params: { id: string } }>("/api/care/floors/:id/cleanup", async (req, reply) => {
    const id = channelParam(req.params.id);
    const r = await caretaker(req.headers.cookie, id, o.hub.isFloor(id));
    if ("error" in r) return fail(reply, r.error);
    const body = FloorCleanup.safeParse(req.body);
    if (!body.success) return fail(reply, "invalid");
    if (rateLimited(r.viewer.certHash)) return fail(reply, "rate-limited");
    // only rooms that are still gone and were on this floor: a room that came back keeps its board
    const wanted = new Set(body.data.rooms);
    const rooms = floorOrphans(id).filter((x) => wanted.has(x.channelId)).map((x) => x.channelId);
    const posts = o.store.removeRooms(rooms);
    o.log?.("Rooms removed from storage", { floor: id, rooms, posts, by: r.viewer.name });
    const done: CareDone = { posts };
    return done;
  });

  // ---------------------------------------------------------------- Building

  const buildingOrphans = () => orphanedFloors(o.store.orphanedRooms(), (id) => o.hub.isFloor(id), (id) => o.store.placeName(id));

  app.get("/api/care/building", async (req, reply) => {
    const r = await caretaker(req.headers.cookie, 0, true);
    if ("error" in r) return fail(reply, r.error);
    const learned = o.store.ticketLinks();
    const tickets: TicketLinks = {};
    for (const p of Object.keys(learned).sort()) tickets[p] = learned[p]!;
    const stats = o.store.channelStats();
    const floors: FloorSummary[] = o.hub.floorPlan().map((f) => {
      const used = f.rooms.flatMap((room) => (stats.has(room.id) ? [stats.get(room.id)!] : []));
      return { channelId: f.id, name: f.name, rooms: used.length, posts: used.reduce((n, x) => n + x.posts, 0), bytes: used.reduce((n, x) => n + x.bytes, 0) };
    });
    const view: BuildingCare = {
      storage: { usedBytes: o.store.usedBytes(), quotaBytes: o.store.quotaBytes, retentionDays: o.store.retentionDays },
      floors,
      orphans: buildingOrphans(),
      tickets,
    };
    return view;
  });

  app.post("/api/care/building/cleanup", async (req, reply) => {
    const r = await caretaker(req.headers.cookie, 0, true);
    if ("error" in r) return fail(reply, r.error);
    const body = BuildingCleanup.safeParse(req.body);
    if (!body.success) return fail(reply, "invalid");
    if (rateLimited(r.viewer.certHash)) return fail(reply, "rate-limited");
    const floors = new Set(body.data.floors);
    const rooms = o.store.orphanedRooms().filter((x) => floors.has(x.floorId) && (x.floorId === null || !o.hub.isFloor(x.floorId))).map((x) => x.channelId);
    const posts = o.store.removeRooms(rooms);
    o.log?.("Floors removed from storage", { floors: [...floors], rooms: rooms.length, posts, by: r.viewer.name });
    const done: CareDone = { posts };
    return done;
  });

  app.post("/api/care/building/tickets/forget", async (req, reply) => {
    const r = await caretaker(req.headers.cookie, 0, true);
    if ("error" in r) return fail(reply, r.error);
    const body = TicketsForget.safeParse(req.body);
    if (!body.success) return fail(reply, "invalid");
    if (rateLimited(r.viewer.certHash)) return fail(reply, "rate-limited");
    const learned = o.store.ticketLinks();
    const projects = body.data.projects.filter((p) => Object.hasOwn(learned, p));
    if (projects.length) {
      o.store.forgetTickets(projects);
      o.log?.("Ticket links forgotten", { projects, by: r.viewer.name });
      // learned links count in every room naming the project: open boards reload
      for (const c of o.store.channelsWithPosts()) o.hub.boardChanged(c);
    }
    return reply.code(204).send();
  });
}
