/**
 * Mock adapter: simulates a Mumble server with the fixtures from `protocol/fixtures`.
 *
 * The behaviour matches the findings of feasibility tests S1/S2:
 * - Channel switches are confirmed after a short delay, rejected after 3 s without the Enter permission.
 * - Of several pending switches only the last one counts (`superseded`); a switch to your own channel is `ok` immediately.
 * - Mute/deaf follow the semantics of the Mumble buttons (only emulated here, the web UI itself does not do this).
 * - Talking events only exist for users in your own room, and not when you are deafened yourself.
 */
import { BOARD_IMAGE_TYPES, BOARD_LIMITS, type Attachment, type CommandBody, type CommandResult, type NewPost, type Post, type PostUpdate, type Snapshot, type TalkingState, type Uploaded } from "@ruumble/protocol";
import leerstand from "@ruumble/protocol/fixtures/leerstand.json";
import musterhaus from "@ruumble/protocol/fixtures/musterhaus.json";
import nichtGekoppelt from "@ruumble/protocol/fixtures/nicht-gekoppelt.json";
import sonderfaelle from "@ruumble/protocol/fixtures/sonderfaelle.json";
import type { AdapterEvents, BoardApi, BoardResult, MumbleAdapter, PluginStatus } from "./types.ts";

const MINUTE = 60_000;

/** Attachment in the mock: content in memory, address as blob or data URL */
interface MockFile { attachment: Omit<Uploaded, "name">; blob?: Blob; url: string }

const hexId = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Sample image (whiteboard sketch), drawn via canvas; none without canvas (unit tests) */
function sampleImage(): MockFile | null {
  try {
    const c = document.createElement("canvas");
    c.width = 960;
    c.height = 600;
    const g = c.getContext("2d");
    if (!g) return null;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 960, 600);
    g.strokeStyle = "#003869";
    g.lineWidth = 6;
    g.strokeRect(60, 60, 360, 200);
    g.strokeRect(540, 60, 360, 200);
    g.strokeRect(300, 360, 360, 180);
    g.beginPath();
    g.moveTo(420, 160); g.lineTo(540, 160); g.moveTo(240, 260); g.lineTo(400, 360); g.moveTo(720, 260); g.lineTo(560, 360);
    g.stroke();
    g.fillStyle = "#003869";
    g.font = "bold 40px sans-serif";
    g.fillText("Browser", 160, 175); g.fillText("Plugin", 660, 175); g.fillText("Dienst", 420, 465);
    const url = c.toDataURL("image/png");
    if (!url.startsWith("data:image/png")) return null;
    return { attachment: { id: hexId(), mime: "image/png", size: Math.round((url.length * 3) / 4), width: 960, height: 600, image: true }, url };
  } catch {
    return null;
  }
}

/** Sample posts for the mock (room ID → posts, newest first) */
function samplePosts(now: number, files: Map<string, MockFile>): Map<number, Post[]> {
  const post = (p: Partial<Post> & Pick<Post, "id" | "channelId" | "kind" | "text" | "authorName">): Post => ({
    mine: false, canDelete: false, createdAt: now, updatedAt: now, ...p,
  });
  const code = [
    "export function greet(name: string): string {",
    "  if (!name) {",
    '    throw new Error("Name fehlt");',
    "  }",
    "  return `Hallo ${name}!`;",
    "}",
    "",
    'console.log(greet("Anna"));',
    "// weitere Zeilen, damit gekürzt wird",
    "const a = 1;",
    "const b = 2;",
  ].join("\n");
  const notes = [
    "## Sprint-Notizen",
    "",
    "- Pinnwand in Ruumble **fertig machen**",
    "- Avatare prüfen",
    "- Termin mit Clara: *Donnerstag 10 Uhr*",
    "",
    "Details stehen im [Wiki](https://example.org/wiki).",
    "",
    "1. Punkt eins",
    "2. Punkt zwei",
    "3. Punkt drei",
    "4. Punkt vier",
  ].join("\n");
  const image = sampleImage();
  if (image) files.set(image.attachment.id, image);
  const protocol = new Blob(["Protokoll der Besprechung\n\n- Pinnwand: Bilder und Dateien\n"], { type: "text/plain" });
  const file: MockFile = { attachment: { id: hexId(), mime: "text/plain", size: protocol.size, image: false }, blob: protocol, url: "" };
  files.set(file.attachment.id, file);
  const attachment = (f: MockFile, name: string): Attachment => {
    const { image: _image, ...a } = f.attachment;
    return { ...a, name };
  };
  return new Map([
    [3, [
      ...(image ? [post({ id: "m4", channelId: 3, kind: "image", authorName: "Clara", createdAt: now - 3 * MINUTE, updatedAt: now - 3 * MINUTE, text: "Skizze vom Whiteboard", attachment: attachment(image, "whiteboard.png") })] : []),
      post({ id: "m5", channelId: 3, kind: "file", authorName: "Ben", createdAt: now - 8 * MINUTE, updatedAt: now - 8 * MINUTE, text: "", attachment: attachment(file, "protokoll.txt") }),
      post({ id: "m1", channelId: 3, kind: "code", language: "typescript", authorName: "Ben", createdAt: now - 12 * MINUTE, updatedAt: now - 12 * MINUTE, text: code }),
      post({ id: "m2", channelId: 3, kind: "text", authorName: "Anna", mine: true, canDelete: true, createdAt: now - 60 * MINUTE, updatedAt: now - 30 * MINUTE, updatedByName: "Ben", text: notes }),
    ]],
    [5, [post({ id: "m3", channelId: 5, kind: "text", authorName: "Clara", text: "Bin ab 14 Uhr im Kundentermin." })]],
  ]);
}

export const FIXTURES = {
  musterhaus,
  sonderfaelle,
  leerstand,
  "nicht-gekoppelt": nichtGekoppelt,
} as unknown as Record<string, Snapshot>;
export type FixtureName = keyof typeof FIXTURES;

export interface MockOptions {
  /** Delay until a switch is confirmed (S2: 10–25 ms, visibly longer here) */
  confirmMs?: number;
  /** Waiting for a confirmation that never comes (ADR-0003) */
  rejectMs?: number;
  /** Simulate talking events */
  talking?: boolean;
}

const clone = <T>(v: T): T => structuredClone(v);

export class MockAdapter implements MumbleAdapter {
  private events: AdapterEvents | null = null;
  private state: Snapshot;
  private plugin: PluginStatus = "connected";
  private pendingJoin: { resolve: (r: CommandResult) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private unmuteOnUndeaf = false;
  private rejectNext = false;
  private talkTimer: ReturnType<typeof setInterval> | null = null;
  private talkingNow = new Set<number>();
  private readonly opts: Required<MockOptions>;
  private files = new Map<string, MockFile>();
  private posts = samplePosts(Date.now(), this.files);
  private nextPostId = 1;
  readonly board: BoardApi = {
    load: async () => this.boardRoom((channelId) => ({ channelId, channelName: this.channelName(channelId), posts: this.posts.get(channelId) ?? [] })),
    create: async (input: NewPost) =>
      this.boardRoom((channelId) => {
        const me = this.me()!;
        const now = Date.now();
        const file = input.attachmentId ? this.files.get(input.attachmentId) : undefined;
        if ((input.kind === "image" || input.kind === "file") && !file) return "invalid";
        if (input.kind === "image" && !file!.attachment.image) return "bad-type";
        const { image: _image, ...stored } = file?.attachment ?? { image: false };
        const post: Post = {
          id: `mock-${this.nextPostId++}`, channelId, kind: input.kind, text: input.text,
          ...(input.language ? { language: input.language } : {}),
          ...(file ? { attachment: { ...(stored as Omit<Attachment, "name">), name: input.attachmentName || "datei" } } : {}),
          authorName: me.name, mine: true, canDelete: true, createdAt: now, updatedAt: now,
        };
        this.posts.set(channelId, [post, ...(this.posts.get(channelId) ?? [])]);
        this.boardChanged(channelId);
        return post;
      }),
    update: async (id: string, change: PostUpdate) =>
      this.boardRoom((channelId) => {
        const list = this.posts.get(channelId) ?? [];
        const i = list.findIndex((p) => p.id === id);
        if (i < 0) return null;
        // like the service: without a language it is reset (“automatic”)
        const { language: _old, ...rest } = list[i]!;
        const updated: Post = { ...rest, text: change.text, ...(change.language ? { language: change.language } : {}), updatedAt: Date.now(), updatedByName: this.me()!.name };
        list[i] = updated;
        this.boardChanged(channelId);
        return updated;
      }),
    remove: async (id: string) =>
      this.boardRoom((channelId) => {
        const list = this.posts.get(channelId) ?? [];
        const post = list.find((p) => p.id === id);
        if (!post) return null;
        if (!post.canDelete) return "forbidden";
        this.posts.set(channelId, list.filter((p) => p.id !== id));
        this.boardChanged(channelId);
        return true as const;
      }),
    upload: async (file: Blob, _name: string, onProgress?: (fraction: number) => void) => {
      const room = this.boardRoom(() => true as const);
      if (!room.ok) return room;
      if (file.size > BOARD_LIMITS.fileBytes) return { ok: false, error: "too-large" };
      // make progress visible, as with a real transfer
      for (const f of [0.25, 0.5, 0.75, 1]) {
        await new Promise((r) => setTimeout(r, 40));
        onProgress?.(f);
      }
      // like the service: SVG is never an image, otherwise the type counts (the service checks the bytes)
      const image = (BOARD_IMAGE_TYPES as readonly string[]).includes(file.type);
      const dims = image ? await createImageBitmap(file).then((b) => ({ width: b.width, height: b.height })).catch(() => null) : null;
      const attachment = { id: hexId(), mime: image ? file.type : file.type && !file.type.startsWith("image/") ? file.type : "application/octet-stream", size: file.size, ...(dims ?? {}), image: image && !!dims };
      this.files.set(attachment.id, { attachment, url: URL.createObjectURL(file) });
      return { ok: true, value: { ...attachment, name: _name } };
    },
    fileUrl: (a: Attachment) => {
      const f = this.files.get(a.id);
      if (!f) return "";
      if (!f.url && f.blob) f.url = URL.createObjectURL(f.blob); // blob URL only when needed
      return f.url;
    },
  };

  constructor(fixture: FixtureName | Snapshot = "musterhaus", opts: MockOptions = {}) {
    this.opts = { confirmMs: 250, rejectMs: 3000, talking: true, ...opts };
    this.state = clone(typeof fixture === "string" ? FIXTURES[fixture]! : fixture);
    if (!this.state.self) this.plugin = "disconnected";
  }

  start(events: AdapterEvents): void {
    this.events = events;
    events.status(this.plugin, false);
    this.emit();
    if (this.opts.talking) this.talkTimer = setInterval(() => this.simulateTalking(), 900);
  }

  stop(): void {
    if (this.talkTimer) clearInterval(this.talkTimer);
    if (this.pendingJoin) clearTimeout(this.pendingJoin.timer);
    this.events = null;
  }

  command(body: CommandBody): Promise<CommandResult> {
    const me = this.me();
    if (this.plugin === "disconnected" || !me) return Promise.resolve("offline");
    switch (body.cmd) {
      case "join":
        return this.join(body.channel);
      case "mute":
        if (body.on) me.selfMute = true;
        else {
          me.selfMute = false;
          me.selfDeaf = false; // unmute also lifts deaf
          this.unmuteOnUndeaf = false;
        }
        this.emit();
        return Promise.resolve("ok");
      case "deaf":
        if (body.on) {
          if (!me.selfMute) this.unmuteOnUndeaf = true;
          me.selfDeaf = true;
          me.selfMute = true;
        } else {
          me.selfDeaf = false;
          if (this.unmuteOnUndeaf) me.selfMute = false;
          this.unmuteOnUndeaf = false;
        }
        this.emit();
        return Promise.resolve("ok");
    }
  }

  /** Sample avatars as SVG (in the mock there is no service that serves images) */
  avatarUrl(userId: number, version: string): string {
    const hue = (userId * 67) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44"><rect width="44" height="44" fill="hsl(${hue} 55% 55%)"/><circle cx="22" cy="17" r="8" fill="#fff"/><path d="M8 42c2-10 26-10 28 0" fill="#fff"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}#${version}`;
  }

  // ---------------------------------------------------------------- Debug actions

  setFixture(name: FixtureName): void {
    this.state = clone(FIXTURES[name]!);
    for (const f of this.files.values()) if (f.url.startsWith("blob:")) URL.revokeObjectURL(f.url);
    this.files.clear();
    this.posts = samplePosts(Date.now(), this.files);
    this.unmuteOnUndeaf = false;
    this.setPlugin(this.state.self ? "connected" : "disconnected");
    this.emit();
  }

  setPlugin(status: PluginStatus): void {
    this.plugin = status;
    this.events?.status(status, false);
  }

  /** The next switch is not confirmed despite access permission (as with the rate limit, S2). */
  rejectNextJoin(): void {
    this.rejectNext = true;
  }

  /** creates a subchannel below a channel (e.g. to lock a floor) */
  addSubchannel(parent: number): void {
    const id = Math.max(...this.state.channels.map((c) => c.id)) + 1;
    this.state.channels.push({ id, parent, name: `Neu ${id}`, position: 99, links: [], temporary: true });
    this.emit();
  }

  removeTemporaryChannels(): void {
    const temp = new Set(this.state.channels.filter((c) => c.temporary && c.name.startsWith("Neu ")).map((c) => c.id));
    this.state.channels = this.state.channels.filter((c) => !temp.has(c.id));
    for (const u of this.state.users) if (temp.has(u.channel)) u.channel = 0;
    this.emit();
  }

  /** moves a random other user into a random channel */
  moveRandomUser(): void {
    const others = this.state.users.filter((u) => u.session !== this.state.self?.session);
    const user = others[Math.floor(Math.random() * others.length)];
    const target = this.state.channels[Math.floor(Math.random() * this.state.channels.length)];
    if (user && target) {
      user.channel = target.id;
      this.stopTalking(user.session);
      this.emit();
    }
  }

  // ---------------------------------------------------------------- internal

  private channelName(id: number): string {
    return this.state.channels.find((c) => c.id === id)?.name ?? "";
  }

  /** like the service: only in your own room on the 2nd level, not temporary (ADR-0011) */
  private boardRoom<T>(fn: (channelId: number) => T | null | "forbidden" | "invalid" | "bad-type"): BoardResult<T> {
    const me = this.me();
    if (this.plugin === "disconnected" || !me) return { ok: false, error: "not-paired" };
    const c = this.state.channels.find((x) => x.id === me.channel);
    const floor = c && c.parent !== null ? this.state.channels.find((x) => x.id === c.parent) : undefined;
    if (!c || c.temporary || !floor || floor.parent !== 0) return { ok: false, error: "no-board-here" };
    const value = fn(c.id);
    if (value === "forbidden" || value === "invalid" || value === "bad-type") return { ok: false, error: value as "forbidden" | "invalid" | "bad-type" };
    return value === null ? { ok: false, error: "not-found" } : { ok: true, value: value as T };
  }

  private boardChanged(channelId: number): void {
    this.events?.board(channelId);
    this.emit();
  }

  private me() {
    return this.state.users.find((u) => u.session === this.state.self?.session);
  }

  private join(channel: number): Promise<CommandResult> {
    const me = this.me()!;
    if (this.pendingJoin) {
      clearTimeout(this.pendingJoin.timer);
      this.pendingJoin.resolve("superseded");
      this.pendingJoin = null;
    }
    if (me.channel === channel) return Promise.resolve("ok");
    const allowed = !this.rejectNext && this.state.canEnter[String(channel)] !== false && this.state.channels.some((c) => c.id === channel);
    this.rejectNext = false;
    return new Promise((resolve) => {
      const timer = setTimeout(
        () => {
          this.pendingJoin = null;
          if (!allowed) return resolve("rejected");
          me.channel = channel;
          for (const session of [...this.talkingNow]) this.stopTalking(session); // like Mumble: whoever is no longer audible → passive
          this.emit();
          resolve("ok");
        },
        allowed ? this.opts.confirmMs : this.opts.rejectMs,
      );
      this.pendingJoin = { resolve, timer };
    });
  }

  private simulateTalking(): void {
    const me = this.me();
    if (!me || me.selfDeaf || this.plugin === "disconnected") return;
    const audible = this.state.users.filter((u) => u.channel === me.channel && !u.selfMute);
    for (const u of audible) {
      if (Math.random() < 0.35) {
        const talking = !this.talkingNow.has(u.session);
        if (talking) this.talkingNow.add(u.session);
        else this.talkingNow.delete(u.session);
        this.events?.talking(u.session, (talking ? "talking" : "passive") as TalkingState);
      }
    }
  }

  private stopTalking(session: number): void {
    if (this.talkingNow.delete(session)) this.events?.talking(session, "passive");
  }

  private emit(): void {
    this.events?.snapshot(clone(this.state));
  }
}
