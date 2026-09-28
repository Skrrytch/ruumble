/**
 * NUR Testvorbereitung für den Live-Test (lokaler Server aus deploy/local, Test-Write-Secret):
 * Nutzer registrieren, Avatar setzen, Nutzer trennen. Der Ruumble-Dienst selbst hat nie das Write-Secret.
 */
import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";

const require = createRequire(new URL("../../bridge/package.json", import.meta.url));
const { Ice } = require("ice");
const { MumbleServer } = require("./gen/MumbleServer.cjs"); // relativ zu bridge/

const WRITE_SECRET = "s1-write-secret-only-for-setup";

export async function withServer<T>(fn: (server: any, M: any) => Promise<T>): Promise<T> {
  const init = new Ice.InitializationData();
  init.properties = Ice.createProperties();
  init.properties.setProperty("Ice.ImplicitContext", "Shared");
  init.properties.setProperty("Ice.Default.EncodingVersion", "1.0");
  init.properties.setProperty("Ice.Default.InvocationTimeout", "5000");
  const c = Ice.initialize(init);
  c.getImplicitContext().put("secret", WRITE_SECRET);
  try {
    const meta = await MumbleServer.MetaPrx.checkedCast(c.stringToProxy("Meta:tcp -h 127.0.0.1 -p 6502"));
    const id = (await meta.getBootedServers())[0].ice_getIdentity().name;
    return await fn(MumbleServer.ServerPrx.uncheckedCast(c.stringToProxy(`s/${id}:tcp -h 127.0.0.1 -p 6502`)), MumbleServer);
  } finally {
    await c.destroy();
  }
}

/** Version des Mumble-Servers, z. B. [1, 5, 735] */
export async function serverVersion(): Promise<[number, number, number]> {
  const init = new Ice.InitializationData();
  init.properties = Ice.createProperties();
  const c = Ice.initialize(init);
  try {
    const meta = await MumbleServer.MetaPrx.checkedCast(c.stringToProxy("Meta:tcp -h 127.0.0.1 -p 6502"));
    const [major, minor, patch] = await meta.getVersion();
    return [major, minor, patch];
  } finally {
    await c.destroy();
  }
}

/** registriert einen Nutzer anhand seines Zertifikats-Hashes (oder liefert die vorhandene ID) */
export async function registerUser(name: string, certHash: string): Promise<number> {
  return withServer(async (server, M) => {
    const existing = await server.getUserIds([name]);
    const known = existing.get(name);
    if (known !== undefined && known >= 0) return known;
    const info = new M.UserInfoMap();
    info.set(M.UserInfo.UserName, name);
    info.set(M.UserInfo.UserHash, certHash);
    return server.registerUser(info);
  });
}

/** Registrierung aufheben (Aufräumen: sonst lehnt Mumble beim nächsten Lauf das neue Test-Zertifikat ab) */
export async function unregisterUser(name: string): Promise<void> {
  await withServer(async (server) => {
    const id = (await server.getUserIds([name])).get(name);
    if (id !== undefined && id > 0) await server.unregisterUser(id);
  });
}

// Hinweis: Ice setTexture und getTexture sind ab Mumble 1.6 unbrauchbar. impl_Server_setTexture und
// impl_Server_getTexture werfen InvalidUserException gerade dann, wenn der Nutzer registriert ist (Bedingung vertauscht,
// in 1.5.735 noch korrekt: isUserId). Den Avatar setzt im Test deshalb ein Client selbst.

/** Test-Bot aus tools/live-test (Mumble-Protokoll in Node), z. B. um als registrierter Nutzer einen Avatar zu setzen */
export function loadBot(): { Bot: new (name: string) => any } {
  return createRequire(new URL("../../tools/live-test/package.json", import.meta.url))("./src/bot.cjs");
}

/** trennt eine Session; der Mumble-Client verbindet sich von selbst neu (und ist dann registriert) */
export async function kick(name: string): Promise<void> {
  await withServer(async (server) => {
    const users = await server.getUsers();
    for (const u of users.values()) if (u.name === name) await server.kickUser(u.session, "Test: neu verbinden");
  });
}

/** einfarbiges PNG (für den Avatar-Test) */
export function solidPng(size: number, [r, g, b]: [number, number, number]): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; // 8 Bit, RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Uint8Array.from(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
