/**
 * Care of the stored data (ADR-0014): the plant in every room, at the end of the corridor and at the entrance.
 * Only for paired users with Mumble's Write permission on that room, floor or the root channel (building). Unlike
 * the board itself, care works from anywhere in the building: it never shows the content of posts.
 *
 *   GET    /api/care/rooms/:id           what the room's board holds and its learned ticket links
 *   DELETE /api/care/rooms/:id/posts     clear the board (all posts with reactions, pin and attachments)
 *   DELETE /api/care/rooms/:id/tickets   forget the learned ticket links of the projects named in the room
 *   GET    /api/care/floors/:id          rooms that were on this floor, are gone and still hold data
 *   POST   /api/care/floors/:id/cleanup  { rooms } remove them with all their data
 *   GET    /api/care/building            floors that are gone and still hold data
 *   POST   /api/care/building/cleanup    { floors } remove them with all their data (null: rooms of an unknown floor)
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { BuildingCleanup, FloorCleanup, learnTicketLinks, ticketProjects, type BuildingCare, type CareDone, type FloorCare, type OrphanedFloor, type RoomCare, type TicketLinks } from "@ruumble/protocol";
import type { Hub, Viewer } from "../hub.ts";
import type { MumbleSource } from "../mumble.ts";
import type { BoardStore, OrphanedRoom } from "./store.ts";

export interface CareRouteOptions {
  store: BoardStore;
  hub: Hub;
  source: Pick<MumbleSource, "canWrite">;
  certHashOf: (cookieHeader: string | undefined) => string | null;
  /** after clearing a board: notice to the people present */
  onCleared?: (channelId: number, viewer: Viewer) => void;
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

  /** projects named in a room, as keys or issue links, that have a learned link */
  function roomTickets(channelId: number): TicketLinks {
    const texts = o.store.list(channelId).map((p) => p.text);
    const projects = ticketProjects(texts.join("\n"));
    for (const t of texts) for (const p of Object.keys(learnTicketLinks(t))) projects.add(p);
    const learned = o.store.ticketLinks();
    const tickets: TicketLinks = {};
    for (const p of [...projects].sort()) if (Object.hasOwn(learned, p)) tickets[p] = learned[p]!;
    return tickets;
  }

  // ---------------------------------------------------------------- Room

  app.get<{ Params: { id: string } }>("/api/care/rooms/:id", async (req, reply) => {
    const id = channelParam(req.params.id);
    const r = await caretaker(req.headers.cookie, id, o.hub.isBoardRoom(id));
    if ("error" in r) return fail(reply, r.error);
    const view: RoomCare = { channelId: id, name: o.hub.channelName(id), ...o.store.roomStats(id), tickets: roomTickets(id) };
    return view;
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
      o.onCleared?.(id, r.viewer);
    }
    const done: CareDone = { posts };
    return done;
  });

  app.delete<{ Params: { id: string } }>("/api/care/rooms/:id/tickets", async (req, reply) => {
    const id = channelParam(req.params.id);
    const r = await caretaker(req.headers.cookie, id, o.hub.isBoardRoom(id));
    if ("error" in r) return fail(reply, r.error);
    if (rateLimited(r.viewer.certHash)) return fail(reply, "rate-limited");
    const projects = Object.keys(roomTickets(id));
    if (projects.length) {
      o.store.forgetTickets(projects);
      o.log?.("Ticket links forgotten", { channel: id, projects, by: r.viewer.name });
      // learned links count in every room naming the project
      for (const c of o.store.channelsWithPosts()) o.hub.boardChanged(c);
    }
    return reply.code(204).send();
  });

  // ---------------------------------------------------------------- Floor

  const floorOrphans = (floorId: number) => o.store.orphanedRooms().filter((r) => r.floorId === floorId);

  app.get<{ Params: { id: string } }>("/api/care/floors/:id", async (req, reply) => {
    const id = channelParam(req.params.id);
    const r = await caretaker(req.headers.cookie, id, o.hub.isFloor(id));
    if ("error" in r) return fail(reply, r.error);
    const view: FloorCare = {
      channelId: id,
      name: o.hub.channelName(id),
      orphans: floorOrphans(id).map(({ channelId, name, posts, bytes, goneSince }) => ({ channelId, name, posts, bytes, goneSince })),
    };
    return view;
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
    const view: BuildingCare = { orphans: buildingOrphans() };
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
}
