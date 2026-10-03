/**
 * Building maintenance (ADR-0016): the wrench at the entrance. Admins (Write on the root channel, as for building
 * care) change the settings that used to be fixed: retention, storage quota, largest attachment, how long the data
 * of deleted rooms is kept, and the Mumble notice for new posts. The environment variables stay as defaults.
 * The keys of all users (ADR-0015) are shown in the same dialog; they come from /api/keys.
 *
 *   GET /api/maintenance            { settings, defaults, usedBytes }
 *   PUT /api/maintenance/settings   BuildingSettings → the same as GET
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { BuildingSettings, type Maintenance } from "@ruumble/protocol";
import type { BoardStore } from "./board/store.ts";
import type { Hub, Viewer } from "./hub.ts";
import type { MumbleSource } from "./mumble.ts";

export interface MaintenanceRouteOptions {
  store: BoardStore;
  hub: Hub;
  source: Pick<MumbleSource, "canWrite">;
  certHashOf: (cookieHeader: string | undefined) => string | null;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export async function maintenanceRoutes(app: FastifyInstance, o: MaintenanceRouteOptions): Promise<void> {
  async function admin(cookie: string | undefined, reply: FastifyReply): Promise<Viewer | null> {
    const viewer = o.hub.whoIs(o.certHashOf(cookie));
    if (!viewer) {
      void reply.code(401).send({ error: "not-paired" });
      return null;
    }
    if (!(await o.source.canWrite(viewer.session, 0))) {
      void reply.code(403).send({ error: "forbidden" });
      return null;
    }
    return viewer;
  }

  const view = (): Maintenance => ({ settings: o.store.settings, defaults: o.store.settingDefaults, usedBytes: o.store.usedBytes() });

  app.get("/api/maintenance", async (req, reply) => {
    if (!(await admin(req.headers.cookie, reply))) return reply;
    return view();
  });

  app.put("/api/maintenance/settings", async (req, reply) => {
    const viewer = await admin(req.headers.cookie, reply);
    if (!viewer) return reply;
    const body = BuildingSettings.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid" });
    const before = o.store.settings;
    const after = o.store.saveSettings(body.data);
    const changed = Object.fromEntries(Object.entries(after).filter(([k, v]) => before[k as keyof typeof before] !== v));
    o.log?.("Building settings changed", { ...changed, by: viewer.name });
    return view();
  });
}
