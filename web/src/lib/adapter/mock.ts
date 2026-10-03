/**
 * Mock adapter: simulates a Mumble server with the fixtures from `protocol/fixtures`.
 *
 * The behaviour matches the findings of feasibility tests S1/S2:
 * - Channel switches are confirmed after a short delay, rejected after 3 s without the Enter permission.
 * - Of several pending switches only the last one counts (`superseded`); a switch to your own channel is `ok` immediately.
 * - Mute/deaf follow the semantics of the Mumble buttons (only emulated here, the web UI itself does not do this).
 * - Talking events only exist for users in your own room, and not when you are deafened yourself.
 */
import { BOARD_IMAGE_TYPES, BOARD_LIMITS, REACTION_KINDS, learnTicketLinks, setTask, ticketProjects, type Attachment, type OrphanedFloor, type OrphanedRoom, type CommandBody, type CommandResult, type NewPost, type Pinned, type Post, type PostUpdate, type ReactionKind, type Snapshot, type TalkingState, type TicketLinks, type Uploaded, type Versions } from "@ruumble/protocol";
import edgeCases from "@ruumble/protocol/fixtures/edge-cases.json";
import sample from "@ruumble/protocol/fixtures/sample.json";
import unpaired from "@ruumble/protocol/fixtures/unpaired.json";
import vacant from "@ruumble/protocol/fixtures/vacant.json";
import type { AdapterEvents, BoardApi, BoardResult, CareApi, MumbleAdapter, PairApi, PluginStatus } from "./types.ts";

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
    g.fillText("Browser", 160, 175); g.fillText("Plugin", 660, 175); g.fillText("Service", 415, 465);
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
    mine: false, canDelete: false, createdAt: now, updatedAt: now, reactions: [], ...p,
  });
  const code = [
    "// fixes RUU-14, see https://github.com/example/ruumble/pull/13",
    "export function greet(name: string): string {",
    "  if (!name) {",
    '    throw new Error("Name is missing");',
    "  }",
    "  return `Hello ${name}!`;",
    "}",
    "",
    'console.log(greet("Anna"));',
    "// a few more lines so the preview gets shortened",
    "const a = 1;",
    "const b = 2;",
    "// CI: https://github.com/example/ruumble/actions/runs/1234567890",
    "// docs: https://example.org/wiki/spaces/DEV/pages/42/Greeting+Rules",
    "// and https://stackoverflow.com/questions/123/how-to-greet-politely",
  ].join("\n");
  const notes = [
    "## Sprint notes",
    "",
    "- **Finish** the Ruumble board",
    "- Review the avatar handling",
    "- Sync with Clara: *Thursday 10 am*",
    "",
    "Details are in the [wiki](https://example.org/wiki) and in https://jira.example.org/browse/RUU-12.",
    "",
    "1. Fix the flaky e2e test (RUU-15)",
    "2. Bump the dependencies",
    "3. Update the changelog",
    "4. Tag the release",
  ].join("\n");
  const image = sampleImage();
  if (image) files.set(image.attachment.id, image);
  const log = new Blob(["2026-09-29 09:12:04 INFO  server started on :8443\n2026-09-29 09:12:05 INFO  board: images and files enabled\n"], { type: "text/plain" });
  const file: MockFile = { attachment: { id: hexId(), mime: "text/plain", size: log.size, image: false }, blob: log, url: "" };
  files.set(file.attachment.id, file);
  const attachment = (f: MockFile, name: string): Attachment => {
    const { image: _image, ...a } = f.attachment;
    return { ...a, name };
  };
  return new Map([
    [3, [
      ...(image ? [post({ id: "m4", channelId: 3, kind: "image", authorName: "Clara", createdAt: now - 3 * MINUTE, updatedAt: now - 3 * MINUTE, text: "Architecture sketch from the whiteboard", attachment: attachment(image, "whiteboard.png") })] : []),
      post({ id: "m5", channelId: 3, kind: "file", authorName: "Ben", createdAt: now - 8 * MINUTE, updatedAt: now - 8 * MINUTE, text: "", attachment: attachment(file, "server.log") }),
      post({ id: "m1", channelId: 3, kind: "code", language: "typescript", authorName: "Ben", createdAt: now - 12 * MINUTE, updatedAt: now - 12 * MINUTE, text: code,
        reactions: [{ kind: "agree", count: 2, names: ["Clara", "Anna"], mine: true }, { kind: "unclear", count: 1, names: ["David"], mine: false }] }),
      post({ id: "m2", channelId: 3, kind: "text", authorName: "Anna", mine: true, canDelete: true, createdAt: now - 60 * MINUTE, updatedAt: now - 30 * MINUTE, updatedByName: "Ben", text: notes,
        reactions: [{ kind: "done", count: 1, names: ["Ben"], mine: false }] }),
    ]],
    [7, [post({ id: "m3", channelId: 7, kind: "text", authorName: "Clara", text: "In a customer call from 2 pm." })]],
  ]);
}

/** board data of rooms that are gone, with their last floor (care, ADR-0014); floor 40 is gone as well */
function sampleOrphans(now: number): { floorId: number | null; floorName: string; room: OrphanedRoom }[] {
  return [
    { floorId: 2, floorName: "Development", room: { channelId: 30, name: "Design review", posts: 4, bytes: 2_400_000, goneSince: now - 2 * 24 * 60 * MINUTE } },
    { floorId: 2, floorName: "Development", room: { channelId: 31, name: "Hackathon 2026", posts: 12, bytes: 0, goneSince: null } },
    { floorId: 40, floorName: "Marketing", room: { channelId: 41, name: "Campaigns", posts: 7, bytes: 5_100_000, goneSince: now - 5 * 24 * 60 * MINUTE } },
    { floorId: 40, floorName: "Marketing", room: { channelId: 42, name: "Events", posts: 2, bytes: 0, goneSince: now - 5 * 24 * 60 * MINUTE } },
    { floorId: null, floorName: "", room: { channelId: 50, name: "", posts: 1, bytes: 0, goneSince: now - 24 * 60 * MINUTE } },
  ];
}

export const FIXTURES = {
  sample,
  "edge-cases": edgeCases,
  vacant,
  unpaired,
} as unknown as Record<string, Snapshot>;
export type FixtureName = keyof typeof FIXTURES;

export interface MockOptions {
  /** Delay until a switch is confirmed (S2: 10–25 ms, visibly longer here) */
  confirmMs?: number;
  /** Waiting for a confirmation that never comes (ADR-0003) */
  rejectMs?: number;
  /** Simulate talking events */
  talking?: boolean;
  /** false: this browser is not paired yet; code 123456 pairs it (ADR-0012) */
  paired?: boolean;
}

/** code that pairs in the mock */
const MOCK_PAIR_CODE = "123456";

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
  private paired: boolean;
  private files = new Map<string, MockFile>();
  private posts = samplePosts(Date.now(), this.files);
  private nextPostId = 1;
  /** room → post kept on top (A3) */
  private pins = new Map<number, Pinned>();
  private orphans = sampleOrphans(Date.now());
  /** projects whose learned link was reset (care); a newer post teaches it again */
  private forgotten = new Map<string, number>();
  readonly care: CareApi = {
    room: async (id) =>
      this.caretaker(id, () => {
        const posts = this.posts.get(id) ?? [];
        const texts = posts.map((p) => p.text);
        const projects = ticketProjects(texts.join("\n"));
        for (const t of texts) for (const p of Object.keys(learnTicketLinks(t))) projects.add(p);
        const learned = this.learnedLinks();
        const tickets = Object.fromEntries([...projects].sort().flatMap((p) => (Object.hasOwn(learned, p) ? [[p, learned[p]!]] : [])));
        return { channelId: id, name: this.channelName(id), posts: posts.length, bytes: posts.reduce((n, p) => n + (p.attachment?.size ?? 0), 0), tickets };
      }, this.isRoom(id)),
    clearRoom: async (id) =>
      this.caretaker(id, () => {
        const posts = (this.posts.get(id) ?? []).length;
        this.posts.delete(id);
        this.pins.delete(id);
        if (posts) this.boardChanged(id);
        return { posts };
      }, this.isRoom(id)),
    forgetTickets: async (id) =>
      this.caretaker(id, () => {
        const now = Date.now();
        for (const p of (this.posts.get(id) ?? []).flatMap((x) => [...ticketProjects(x.text), ...Object.keys(learnTicketLinks(x.text))])) this.forgotten.set(p, now);
        this.boardChanged(id);
        return true as const;
      }, this.isRoom(id)),
    floor: async (id) =>
      this.caretaker(id, () => ({ channelId: id, name: this.channelName(id), orphans: this.orphans.filter((o) => o.floorId === id).map((o) => o.room) }), this.isFloor(id)),
    cleanFloor: async (id, rooms) =>
      this.caretaker(id, () => this.removeOrphans((o) => o.floorId === id && rooms.includes(o.room.channelId)), this.isFloor(id)),
    building: async () =>
      this.caretaker(0, () => {
        const floors = new Map<number | null, OrphanedFloor>();
        for (const o of this.orphans) {
          if (o.floorId !== null && this.isFloor(o.floorId)) continue;
          const f = floors.get(o.floorId) ?? { channelId: o.floorId, name: o.floorName, rooms: 0, posts: 0, bytes: 0, goneSince: null };
          const gone = o.room.goneSince;
          floors.set(o.floorId, { ...f, rooms: f.rooms + 1, posts: f.posts + o.room.posts, bytes: f.bytes + o.room.bytes, goneSince: gone === null ? f.goneSince : Math.min(gone, f.goneSince ?? gone) });
        }
        return { orphans: [...floors.values()] };
      }, true),
    cleanBuilding: async (floors) =>
      this.caretaker(0, () => this.removeOrphans((o) => floors.includes(o.floorId) && (o.floorId === null || !this.isFloor(o.floorId))), true),
  };
  readonly board: BoardApi = {
    load: async () =>
      this.boardRoom((channelId) => {
        const posts = this.posts.get(channelId) ?? [];
        // like the service: the pin goes away with its post
        const pin = this.pins.get(channelId);
        const pinned = pin && posts.some((p) => p.id === pin.postId) ? pin : null;
        return { channelId, channelName: this.channelName(channelId), posts, pinned, tickets: this.ticketLinks(posts) };
      }),
    pin: async (postId: string, title: string) =>
      this.boardRoom((channelId) => {
        if (!(this.posts.get(channelId) ?? []).some((p) => p.id === postId)) return null;
        if (!title.trim() || title.trim().length > 40) return "invalid";
        const pinned: Pinned = { postId, title: title.trim(), pinnedByName: this.me()!.name, pinnedAt: Date.now() };
        this.pins.set(channelId, pinned);
        this.boardChanged(channelId);
        return pinned;
      }),
    unpin: async () =>
      this.boardRoom((channelId) => {
        this.pins.delete(channelId);
        this.boardChanged(channelId);
        return true as const;
      }),
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
          ...(file ? { attachment: { ...(stored as Omit<Attachment, "name">), name: input.attachmentName || "file" } } : {}),
          authorName: me.name, mine: true, canDelete: true, createdAt: now, updatedAt: now, reactions: [],
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
    copy: async (id: string, target: number) =>
      this.boardRoom((channelId) => {
        const post = (this.posts.get(channelId) ?? []).find((p) => p.id === id);
        if (!post) return null;
        const c = this.state.channels.find((x) => x.id === target);
        const floor = c && c.parent !== null ? this.state.channels.find((x) => x.id === c.parent) : undefined;
        if (target === channelId || !c || c.temporary || !floor || floor.parent !== 0) return "invalid";
        if (this.state.canEnter[String(target)] === false) return "forbidden";
        const now = Date.now();
        const copy: Post = {
          ...post, id: `mock-${this.nextPostId++}`, channelId: target, authorName: this.me()!.name, mine: true, canDelete: true, createdAt: now, updatedAt: now, reactions: [],
          copiedFrom: { roomName: this.channelName(channelId), authorName: post.copiedFrom?.authorName ?? post.authorName },
        };
        delete copy.updatedByName;
        this.posts.set(target, [copy, ...(this.posts.get(target) ?? [])]);
        this.boardChanged(target);
        return copy;
      }),
    toggleTask: async (id: string, index: number, done: boolean) =>
      this.boardRoom((channelId) => {
        const list = this.posts.get(channelId) ?? [];
        const i = list.findIndex((p) => p.id === id);
        if (i < 0) return null;
        // like the service: exactly one line, and no edit if nothing changes
        const text = list[i]!.kind === "text" ? setTask(list[i]!.text, index, done) : null;
        if (text === null) return "invalid";
        if (text !== list[i]!.text) {
          list[i] = { ...list[i]!, text, updatedAt: Date.now(), updatedByName: this.me()!.name };
          this.boardChanged(channelId);
        }
        return list[i]!;
      }),
    react: async (id: string, kind: ReactionKind, on: boolean) =>
      this.boardRoom((channelId) => {
        const list = this.posts.get(channelId) ?? [];
        const i = list.findIndex((p) => p.id === id);
        if (i < 0) return null;
        const name = this.me()!.name;
        // like the service: only the toggled kind changes, the own name at most once and at the end
        const reactions = REACTION_KINDS.flatMap((k) => {
          const r = list[i]!.reactions.find((x) => x.kind === k);
          if (k !== kind) return r ? [r] : [];
          const names = [...(r?.names ?? []).filter((n) => !(r?.mine && n === name)), ...(on ? [name] : [])];
          return names.length ? [{ kind: k, count: names.length, names, mine: on }] : [];
        });
        list[i] = { ...list[i]!, reactions };
        this.boardChanged(channelId);
        return list[i]!;
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

  constructor(fixture: FixtureName | Snapshot = "sample", opts: MockOptions = {}) {
    this.opts = { confirmMs: 250, rejectMs: 3000, talking: true, paired: true, ...opts };
    this.paired = this.opts.paired;
    this.state = clone(typeof fixture === "string" ? FIXTURES[fixture]! : fixture);
    if (!this.state.self) this.plugin = "disconnected";
  }

  readonly pairing: PairApi = {
    request: async () => (this.paired ? { ok: false, error: "invalid" } : { ok: true, value: "mock-request" }),
    confirm: async (request, code) => {
      if (request !== "mock-request") return { ok: false, error: "expired" };
      if (code !== MOCK_PAIR_CODE) return { ok: false, error: "wrong-code" };
      this.paired = true;
      if (this.events) this.start(this.events);
      return { ok: true, value: true };
    },
  };

  start(events: AdapterEvents): void {
    this.events = events;
    if (!this.paired) return events.connection("unpaired");
    events.status(this.plugin, false);
    this.emit();
    if (this.opts.talking) this.talkTimer = setInterval(() => this.simulateTalking(), 900);
  }

  stop(): void {
    if (this.talkTimer) clearInterval(this.talkTimer);
    if (this.pendingJoin) clearTimeout(this.pendingJoin.timer);
    this.events = null;
  }

  async versions(): Promise<Versions> {
    return { service: __UI_VERSION__, plugin: __PLUGIN_VERSION__ };
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
    this.orphans = sampleOrphans(Date.now());
    this.forgotten.clear();
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
    this.state.channels.push({ id, parent, name: `New ${id}`, position: 99, links: [], temporary: true });
    this.emit();
  }

  removeTemporaryChannels(): void {
    const temp = new Set(this.state.channels.filter((c) => c.temporary && c.name.startsWith("New ")).map((c) => c.id));
    this.state.channels = this.state.channels.filter((c) => !temp.has(c.id));
    for (const u of this.state.users) if (temp.has(u.channel)) u.channel = 0;
    this.emit();
  }

  /** someone else pins a note to the board of the user's own room (if it has one) */
  postAsOther(): void {
    const me = this.me();
    const author = this.state.users.find((u) => u.session !== me?.session)?.name ?? "Ben";
    this.boardRoom((channelId) => {
      const now = Date.now();
      const text = `Note from ${author}, ${new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
      const post: Post = { id: `mock-${this.nextPostId++}`, channelId, kind: "text", text, authorName: author, mine: false, canDelete: false, createdAt: now, updatedAt: now, reactions: [] };
      this.posts.set(channelId, [post, ...(this.posts.get(channelId) ?? [])]);
      this.boardChanged(channelId);
      return post;
    });
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

  /** like the service: learned from the issue links in all rooms (oldest first); a reset project only from newer posts */
  private learnedLinks(): TicketLinks {
    const all = [...this.posts.values()].flat().sort((a, b) => a.createdAt - b.createdAt);
    const learned: TicketLinks = {};
    for (const p of all) {
      for (const [project, base] of Object.entries(learnTicketLinks(p.text))) {
        if (!Object.hasOwn(learned, project) && p.createdAt > (this.forgotten.get(project) ?? -Infinity)) learned[project] = base;
      }
    }
    return learned;
  }

  /** only projects mentioned in this room */
  private ticketLinks(posts: Post[]): TicketLinks {
    const learned = this.learnedLinks();
    const projects = ticketProjects(posts.map((p) => p.text).join("\n"));
    return Object.fromEntries(Object.entries(learned).filter(([project]) => projects.has(project)));
  }

  private isFloor(id: number): boolean {
    return this.state.channels.some((c) => c.id === id && c.parent === 0);
  }

  private isRoom(id: number): boolean {
    const c = this.state.channels.find((x) => x.id === id);
    return !!c && !c.temporary && c.parent !== null && this.isFloor(c.parent);
  }

  /** like the service: Write permission on the channel (the snapshot's `care`), from anywhere in the building */
  private caretaker<T>(channelId: number, fn: () => T, exists: boolean): BoardResult<T> {
    if (this.plugin === "disconnected" || !this.me()) return { ok: false, error: "not-paired" };
    if (!exists) return { ok: false, error: "not-found" };
    if (!this.state.care?.includes(channelId)) return { ok: false, error: "forbidden" };
    return { ok: true, value: fn() };
  }

  private removeOrphans(match: (o: (typeof this.orphans)[number]) => boolean): { posts: number } {
    const gone = this.orphans.filter(match);
    this.orphans = this.orphans.filter((o) => !match(o));
    return { posts: gone.reduce((n, o) => n + o.room.posts, 0) };
  }

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
