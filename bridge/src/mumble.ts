/**
 * Lesender Zugriff auf den Mumble-Server über Ice (ADR-0002, Analyse 3.2).
 * Nur Methoden, die das Read-Secret erlaubt. Schreibende Aufrufe gibt es hier nicht.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { Channel, User } from "@ruumble/protocol";

export interface Basics {
  channels: Channel[];
  users: (User & { address: string })[];
  /** Sekunden seit dem Start des virtuellen Servers; wird kleiner → Neustart */
  uptime: number;
}

export interface ServerInfo {
  name: string;
  version: string;
}

/** Alles, was der Dienst vom Mumble-Server liest. */
export interface MumbleSource {
  basics(): Promise<Basics>;
  serverInfo(): Promise<ServerInfo>;
  listeners(channelIds: number[]): Promise<Record<string, number[]>>;
  canEnter(session: number, channelIds: number[]): Promise<Record<string, boolean>>;
  /** SHA1 hex von certs[0], `null` ohne Zertifikat oder bei unbekannter Session */
  certHash(session: number): Promise<string | null>;
  close(): Promise<void>;
}

export interface IceOptions {
  host: string;
  port: number;
  secret: string;
  /** ohne Angabe: erster laufender Server (in 1.6.870 hat er die ID 0, S1) */
  serverId?: number;
}

const require = createRequire(import.meta.url);

/** 16-Byte-Adresse aus Ice als Text; IPv4 in IPv6 (::ffff:a.b.c.d) wird zu a.b.c.d. */
export function formatAddress(bytes: Uint8Array | number[] | null | undefined): string {
  const b = Array.from(bytes ?? []);
  if (b.length !== 16) return "";
  if (b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff) return b.slice(12).join(".");
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(((b[i]! << 8) | b[i + 1]!).toString(16));
  return groups.join(":");
}

export class IceMumbleSource implements MumbleSource {
  private readonly communicator: { destroy(): Promise<void> };
  // Ice-Proxys sind untypisiert (aus slice2js erzeugt)
  private readonly meta: any;
  private readonly server: any;
  private readonly permissionEnter: number;

  private constructor(communicator: { destroy(): Promise<void> }, meta: any, server: any, permissionEnter: number) {
    this.communicator = communicator;
    this.meta = meta;
    this.server = server;
    this.permissionEnter = permissionEnter;
  }

  static async connect(opts: IceOptions): Promise<IceMumbleSource> {
    const { Ice } = require("ice");
    const { MumbleServer } = require("../gen/MumbleServer.cjs");
    const init = new Ice.InitializationData();
    init.properties = Ice.createProperties();
    init.properties.setProperty("Ice.ImplicitContext", "Shared");
    init.properties.setProperty("Ice.Default.EncodingVersion", "1.0");
    init.properties.setProperty("Ice.Default.InvocationTimeout", "5000");
    const communicator = Ice.initialize(init);
    communicator.getImplicitContext().put("secret", opts.secret);
    try {
      const endpoint = `tcp -h ${opts.host} -p ${opts.port}`;
      const meta = await MumbleServer.MetaPrx.checkedCast(communicator.stringToProxy(`Meta:${endpoint}`));
      let id = opts.serverId;
      if (id === undefined) {
        const booted = await meta.getBootedServers();
        if (booted.length === 0) throw new Error("Kein laufender virtueller Server");
        // Der Proxy trägt den Endpoint aus Sicht des Servers (z. B. Container-IP): nur die Identität übernehmen (S1)
        id = Number(booted[0].ice_getIdentity().name);
      }
      const server = MumbleServer.ServerPrx.uncheckedCast(communicator.stringToProxy(`s/${id}:${endpoint}`));
      return new IceMumbleSource(communicator, meta, server, MumbleServer.PermissionEnter);
    } catch (e) {
      await communicator.destroy();
      throw e;
    }
  }

  async basics(): Promise<Basics> {
    const [channels, users, uptime] = await Promise.all([this.server.getChannels(), this.server.getUsers(), this.server.getUptime()]);
    return {
      channels: [...channels.values()].map((c: any) => ({
        id: c.id,
        parent: c.parent < 0 ? null : c.parent,
        name: c.name,
        position: c.position,
        links: [...c.links],
        temporary: c.temporary,
      })),
      users: [...users.values()].map((u: any) => ({
        session: u.session,
        name: u.name,
        channel: u.channel,
        selfMute: u.selfMute,
        selfDeaf: u.selfDeaf,
        mute: u.mute,
        deaf: u.deaf,
        suppress: u.suppress,
        address: formatAddress(u.address),
      })),
      uptime,
    };
  }

  async serverInfo(): Promise<ServerInfo> {
    const [conf, defaults, version] = await Promise.all([
      this.server.getConf("registername").catch(() => ""),
      this.meta.getDefaultConf().catch(() => new Map()),
      this.meta.getVersion(),
    ]);
    // wie der Mumble-Client: registername, sonst „Root“ (Analyse 3.2)
    const name = conf || defaults.get("registername") || "Root";
    return { name, version: `${version[0]}.${version[1]}.${version[2]}` };
  }

  async listeners(channelIds: number[]): Promise<Record<string, number[]>> {
    const lists = await Promise.all(channelIds.map((id) => this.server.getListeningUsers(id).catch(() => [])));
    const result: Record<string, number[]> = {};
    channelIds.forEach((id, i) => {
      if (lists[i].length > 0) result[String(id)] = [...lists[i]];
    });
    return result;
  }

  async canEnter(session: number, channelIds: number[]): Promise<Record<string, boolean>> {
    const perms = await Promise.all(channelIds.map((id) => this.server.hasPermission(session, id, this.permissionEnter).catch(() => true)));
    const result: Record<string, boolean> = {};
    channelIds.forEach((id, i) => {
      if (!perms[i]) result[String(id)] = false; // fehlt ein Kanal, gilt true (Protokoll)
    });
    return result;
  }

  async certHash(session: number): Promise<string | null> {
    try {
      const certs = await this.server.getCertificateList(session);
      if (!certs.length) return null;
      return createHash("sha1").update(Buffer.from(certs[0])).digest("hex");
    } catch {
      return null;
    }
  }

  async close(): Promise<void> {
    await this.communicator.destroy();
  }
}
