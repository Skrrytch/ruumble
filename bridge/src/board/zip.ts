/**
 * Streaming ZIP writer for the board export (care, ADR-0014): text is deflated, images and other binaries are
 * stored as they are. Each entry is written as it is read, with its CRC and sizes in a data descriptor after the
 * data, so neither the files nor the archive are ever held in memory and deflating does not block the event loop.
 * ZIP64 records are added when the archive passes 4 GB or 65535 entries (a quota may be up to 1 TB, ADR-0016); a
 * single entry stays below 4 GB (attachments are at most 100 MB).
 */
import { Readable, pipeline } from "node:stream";
import { createDeflateRaw, crc32 } from "node:zlib";

export interface ZipEntry {
  /** path inside the archive, forward slashes */
  name: string;
  /** the content, or a function that opens it when the entry is written (a file stream) */
  data: Uint8Array | (() => AsyncIterable<Uint8Array>);
  /** deflate (text); otherwise stored (already compressed images) */
  compress?: boolean;
  /** modification time, default now */
  date?: Date;
}

const MAX32 = 0xffffffff;
const MAX16 = 0xffff;
/** general purpose flags: sizes in a data descriptor (bit 3), UTF-8 names (bit 11) */
const FLAGS = 0x0808;

/** DOS date and time as ZIP stores them (local time, 2-second steps) */
function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * The archive as a stream of chunks. `forceZip64` writes the ZIP64 records even for a small archive (tests);
 * normally they appear only when needed.
 */
export async function* zipStream(entries: Iterable<ZipEntry>, opts: { forceZip64?: boolean } = {}): AsyncGenerator<Buffer> {
  const central: Buffer[] = [];
  let offset = 0;
  let count = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const method = e.compress ? 8 : 0;
    const { time, date } = dosTime(e.date ?? new Date());
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(FLAGS, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    // CRC and sizes (14–25) stay 0: they follow in the data descriptor
    local.writeUInt16LE(name.length, 26);
    yield local;
    yield name;

    let crc = 0;
    let raw = 0;
    let packed = 0;
    const input = typeof e.data === "function" ? e.data() : [e.data];
    async function* counted(): AsyncGenerator<Buffer> {
      for await (const chunk of input) {
        const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        crc = crc32(b, crc);
        raw += b.length;
        yield b;
      }
    }
    let body: AsyncIterable<Buffer> = counted();
    if (e.compress) {
      const deflate = createDeflateRaw();
      pipeline(Readable.from(body), deflate, () => {}); // an error in the source destroys `deflate`, so the loop below throws
      body = deflate;
    }
    for await (const chunk of body) {
      packed += chunk.length;
      yield chunk;
    }
    if (raw > MAX32 || packed > MAX32) throw new Error(`zip: entry ${e.name} is larger than 4 GB`);

    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(packed, 8);
    descriptor.writeUInt32LE(raw, 12);
    yield descriptor;

    const far = opts.forceZip64 || offset >= MAX32;
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE((3 << 8) | (far ? 45 : 20), 4); // version made by: Unix, so tools read the UTF-8 name as it is
    dir.writeUInt16LE(far ? 45 : 20, 6); // version needed
    dir.writeUInt16LE(FLAGS, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(date, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(packed, 20);
    dir.writeUInt32LE(raw, 24);
    dir.writeUInt16LE(name.length, 28);
    let extra = Buffer.alloc(0);
    if (far) {
      // ZIP64 extended information: only the local header offset, the sizes fit in 32 bits
      extra = Buffer.alloc(12);
      extra.writeUInt16LE(0x0001, 0);
      extra.writeUInt16LE(8, 2);
      extra.writeBigUInt64LE(BigInt(offset), 4);
    }
    dir.writeUInt16LE(extra.length, 30);
    dir.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attributes: a regular file, rw-r--r--
    dir.writeUInt32LE(far ? MAX32 : offset, 42);
    central.push(dir, name, extra);
    offset += local.length + name.length + packed + descriptor.length;
    count++;
  }

  const dirOffset = offset;
  const dirSize = central.reduce((n, b) => n + b.length, 0);
  for (const b of central) yield b;

  const zip64 = opts.forceZip64 || count >= MAX16 || dirOffset >= MAX32 || dirSize >= MAX32;
  if (zip64) {
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06064b50, 0);
    record.writeBigUInt64LE(44n, 4); // size of the rest of the record
    record.writeUInt16LE(45, 12); // version made by
    record.writeUInt16LE(45, 14); // version needed
    // disk numbers (16, 20) stay 0
    record.writeBigUInt64LE(BigInt(count), 24);
    record.writeBigUInt64LE(BigInt(count), 32);
    record.writeBigUInt64LE(BigInt(dirSize), 40);
    record.writeBigUInt64LE(BigInt(dirOffset), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeBigUInt64LE(BigInt(dirOffset + dirSize), 8);
    locator.writeUInt32LE(1, 16); // total number of disks
    yield record;
    yield locator;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(zip64 ? MAX16 : count, 8);
  end.writeUInt16LE(zip64 ? MAX16 : count, 10);
  end.writeUInt32LE(zip64 ? MAX32 : dirSize, 12);
  end.writeUInt32LE(zip64 ? MAX32 : dirOffset, 16);
  yield end;
}
