/**
 * ONLY test setup for the live test (local server from deploy/local, test write secret):
 * register users, set avatars, disconnect users. The Ruumble service itself never has the write secret.
 */
import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";

const require = createRequire(new URL("../../bridge/package.json", import.meta.url));
const { Ice } = require("ice");
const { MumbleServer } = require("./gen/MumbleServer.cjs"); // relative to bridge/

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

/** version of the Mumble server, e.g. [1, 5, 735] */
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

/** registers a user by their certificate hash (or returns the existing ID) */
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

/** remove the registration (clean-up: otherwise Mumble rejects the new test certificate on the next run) */
export async function unregisterUser(name: string): Promise<void> {
  await withServer(async (server) => {
    const id = (await server.getUserIds([name])).get(name);
    if (id !== undefined && id > 0) await server.unregisterUser(id);
  });
}

// Note: Ice setTexture and getTexture are unusable from Mumble 1.6 on. impl_Server_setTexture and
// impl_Server_getTexture throw InvalidUserException precisely when the user is registered (condition inverted,
// still correct in 1.5.735: isUserId). In the test, a client therefore sets the avatar itself.

/** test bot from tools/live-test (Mumble protocol in Node), e.g. to set an avatar as a registered user */
export function loadBot(): { Bot: new (name: string) => any } {
  return createRequire(new URL("../../tools/live-test/package.json", import.meta.url))("./src/bot.cjs");
}

/** disconnects a session; the Mumble client reconnects by itself (and is then registered) */
export async function kick(name: string): Promise<void> {
  await withServer(async (server) => {
    const users = await server.getUsers();
    for (const u of users.values()) if (u.name === name) await server.kickUser(u.session, "Test: reconnect");
  });
}

/** single-colour PNG (for the avatar test) */
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
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2; // 8 bit, RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Uint8Array.from(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
