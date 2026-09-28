/**
 * Avatar-Zwischenspeicher (AP9): Bilder registrierter Nutzer per Ice getTexture, nur im Arbeitsspeicher.
 * Ice meldet keine Änderungen, deshalb wird regelmäßig neu abgefragt und über einen Hash versioniert.
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

  /** ein Bild sofort (neu) laden */
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
