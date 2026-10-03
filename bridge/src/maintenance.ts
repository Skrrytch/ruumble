/**
 * Building maintenance (ADR-0016): the wrench at the entrance. Admins (Write on the root channel, as for building
 * care) change the settings that used to be fixed: retention, storage quota, largest attachment, how long the data
 * of deleted rooms is kept, and the Mumble notice for new posts. The environment variables stay as defaults.
 * The keys of all users (ADR-0015) are shown in the same dialog; they come from /api/keys.
 *
 *   GET /api/maintenance            { settings, defaults, usedBytes }
 *   PUT /api/maintenance/settings   BuildingSettings → the same as GET
 */
import type { FastifyInstance } from "fastify";
import { BuildingSettings, type Maintenance } from "@ruumble/protocol";
import { fail, type Gate } from "./access.ts";
import type { BoardStore } from "./board/store.ts";

export interface MaintenanceRouteOptions {
  store: BoardStore;
  /** who is asking and their Write permission (access.ts): admins have Write on the root channel */
  gate: Gate;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export async function maintenanceRoutes(app: FastifyInstance, o: MaintenanceRouteOptions): Promise<void> {
  const view = (): Maintenance => ({ settings: o.store.settings, defaults: o.store.settingDefaults, usedBytes: o.store.usedBytes() });

  app.get("/api/maintenance", async (req, reply) => {
    const viewer = await o.gate.writer(req, 0);
    if (typeof viewer === "string") return fail(reply, viewer);
    return view();
  });

  app.put("/api/maintenance/settings", async (req, reply) => {
    const viewer = await o.gate.writer(req, 0);
    if (typeof viewer === "string") return fail(reply, viewer);
    const body = BuildingSettings.safeParse(req.body);
    if (!body.success) return fail(reply, "invalid");
    const before = o.store.settings;
    const after = o.store.saveSettings(body.data);
    const changed = Object.fromEntries(Object.entries(after).filter(([k, v]) => before[k as keyof typeof before] !== v));
    o.log?.("Building settings changed", { ...changed, by: viewer.name });
    return view();
  });
}
