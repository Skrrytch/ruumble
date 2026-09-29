/**
 * Avatar cache (AP9): images of registered users via Ice getTexture, in memory only.
 * Ice reports no changes, so they are re-fetched periodically and versioned by a hash.
 */
import { createHash } from "node:crypto";
import { detectImage } from "./board/media.ts";

export const MAX_AVATAR_BYTES = 256 * 1024;

export interface Avatar {
  version: string;
  mime: string;
  bytes: Uint8Array;
}

export interface AvatarOptions {
  fetch: (userId: number) => Promise<Uint8Array | null>;
  /** after a change (new or removed image) */
  onChange: () => void;
  refreshMs?: number;
  /** entries of users absent for this long are discarded */
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

  /** reconcile with the currently present registered users; fetches new and stale images in the background */
  sync(userIds: Iterable<number>): void {
    const now = this.opts.now();
    for (const id of userIds) {
      const e = this.entries.get(id) ?? { avatar: null, fetchedAt: Number.NEGATIVE_INFINITY, lastSeen: now, pending: false }; // never loaded yet
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

  /** (re)load an image immediately */
  private async load(userId: number, entry = this.entries.get(userId)): Promise<void> {
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
