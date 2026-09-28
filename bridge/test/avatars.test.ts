import { describe, expect, it } from "vitest";
import { AvatarCache, MAX_AVATAR_BYTES, detectImage } from "../src/avatars.ts";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9]);

describe("detectImage", () => {
  it("erkennt PNG, JPEG, GIF, WEBP; altes Mumble-Rohformat und Unbekanntes nicht", () => {
    expect(detectImage(PNG)).toBe("image/png");
    expect(detectImage(JPEG)).toBe("image/jpeg");
    expect(detectImage(new TextEncoder().encode("GIF89a…"))).toBe("image/gif");
    expect(detectImage(new TextEncoder().encode("RIFF1234WEBPVP8 "))).toBe("image/webp");
    expect(detectImage(Uint8Array.from([0, 0, 0x8c, 0xa0, 0x78, 0x9c]))).toBeNull(); // qCompress: Länge + zlib
    expect(detectImage(new Uint8Array())).toBeNull();
  });
});

describe("AvatarCache", () => {
  function setup(images: Record<number, Uint8Array | null>) {
    let t = 0;
    let changes = 0;
    const calls: number[] = [];
    const cache = new AvatarCache({
      fetch: async (id) => { calls.push(id); return images[id] ?? null; },
      onChange: () => changes++,
      refreshMs: 1000,
      forgetMs: 5000,
      now: () => t,
    });
    return { cache, calls, advance: (ms: number) => (t += ms), changes: () => changes };
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("lädt beim ersten Auftauchen, versioniert per Hash und meldet Änderungen", async () => {
    const images: Record<number, Uint8Array | null> = { 1: PNG };
    const s = setup(images);
    s.cache.sync([1, 2]);
    await settle();
    expect(s.calls).toEqual([1, 2]);
    expect(s.cache.version(1)).toMatch(/^[0-9a-f]{16}$/);
    expect(s.cache.version(2)).toBeNull();
    expect(s.cache.version(null)).toBeNull();
    expect(s.cache.get(1)?.mime).toBe("image/png");
    expect(s.changes()).toBe(1);
    const first = s.cache.version(1);
    // vor Ablauf kein neuer Abruf, danach schon – neues Bild → neue Version
    s.cache.sync([1]);
    expect(s.calls).toHaveLength(2);
    images[1] = JPEG;
    s.advance(1000);
    s.cache.sync([1]);
    await settle();
    expect(s.cache.version(1)).not.toBe(first);
    expect(s.changes()).toBe(2);
  });

  it("zu große Bilder gelten als kein Avatar, verschwundene Nutzer werden vergessen", async () => {
    const big = new Uint8Array(MAX_AVATAR_BYTES + 1);
    big.set(PNG);
    const s = setup({ 3: big, 4: PNG });
    s.cache.sync([3, 4]);
    await settle();
    expect(s.cache.version(3)).toBeNull();
    expect(s.cache.version(4)).not.toBeNull();
    s.advance(6000);
    s.cache.sync([]);
    expect(s.cache.version(4)).toBeNull();
  });
});
