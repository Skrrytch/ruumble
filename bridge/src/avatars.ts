/**
 * Avatar-Zwischenspeicher (AP9): Bilder registrierter Nutzer per Ice getTexture, nur im Arbeitsspeicher.
 * Ice meldet keine Änderungen, deshalb wird regelmäßig neu abgefragt und über einen Hash versioniert.
 */
import { createHash } from "node:crypto";

export const MAX_AVATAR_BYTES = 256 * 1024;

export interface Avatar {
  version: string;
  mime: string;
  bytes: Uint8Array;
}

/** Bildformat an den ersten Bytes erkennen. Das alte Mumble-Rohformat (zlib, 600×60 BGRA) gilt als „kein Bild“. */
export function detectImage(bytes: Uint8Array): string | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x38) return "image/gif";
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return "image/webp";
  return null;
}

export interface AvatarOptions {
  fetch: (userId: number) => Promise<Uint8Array | null>;
  /** nach einer Änderung (neues oder entferntes Bild) */
  onChange: () => void;
  refreshMs?: number;
  /** Einträge von Nutzern, die so lange fehlen, werden verworfen */
  forgetMs?: number;
  now?: () => number;
}

interface Entry {
  avatar: Avatar | null;
  fetchedAt: number;
  lastSeen: number;
  pending: boolean;
}

export class AvatarCache {
  private readonly opts: Required<AvatarOptions>;
  private readonly entries = new Map<number, Entry>();

  constructor(opts: AvatarOptions) {
    this.opts = { refreshMs: 5 * 60_000, forgetMs: 60 * 60_000, now: Date.now, ...opts };
  }

  /** mit den aktuell anwesenden registrierten Nutzern abgleichen; holt neue und veraltete Bilder im Hintergrund */
  sync(userIds: Iterable<number>): void {
    const now = this.opts.now();
    for (const id of userIds) {
      const e = this.entries.get(id) ?? { avatar: null, fetchedAt: Number.NEGATIVE_INFINITY, lastSeen: now, pending: false }; // noch nie geladen
      e.lastSeen = now;
      this.entries.set(id, e);
      if (!e.pending && now - e.fetchedAt >= this.opts.refreshMs) void this.load(id, e);
    }
    for (const [id, e] of this.entries) if (now - e.lastSeen > this.opts.forgetMs) this.entries.delete(id);
  }

  version(userId: number | null): string | null {
    return userId === null ? null : (this.entries.get(userId)?.avatar?.version ?? null);
  }

  get(userId: number): Avatar | null {
    return this.entries.get(userId)?.avatar ?? null;
  }

  /** öffentlich für Tests: ein Bild sofort (neu) laden */
  async load(userId: number, entry = this.entries.get(userId)): Promise<void> {
    if (!entry) return;
    entry.pending = true;
    try {
      const bytes = await this.opts.fetch(userId);
      const mime = bytes && bytes.length <= MAX_AVATAR_BYTES ? detectImage(bytes) : null;
      const avatar: Avatar | null =
        bytes && mime ? { version: createHash("sha256").update(bytes).digest("hex").slice(0, 16), mime, bytes } : null;
      const changed = (entry.avatar?.version ?? null) !== (avatar?.version ?? null);
      entry.avatar = avatar;
      entry.fetchedAt = this.opts.now();
      if (changed) this.opts.onChange();
    } finally {
      entry.pending = false;
    }
  }
}
