/**
 * Mock adapter: simulates a Mumble server with the fixtures from `protocol/fixtures`.
 *
 * The behaviour matches the findings of feasibility tests S1/S2:
 * - Channel switches are confirmed after a short delay, rejected after 3 s without the Enter permission.
 * - Of several pending switches only the last one counts (`superseded`); a switch to your own channel is `ok` immediately.
 * - Mute/deaf follow the semantics of the Mumble buttons (only emulated here, the web UI itself does not do this).
 * - Talking events only exist for users in your own room, and not when you are deafened yourself.
 */
import { BOARD_IMAGE_TYPES, BOARD_LIMITS, PRUNE_DAYS, BuildingSettings, REACTION_KINDS, STATUS_LIMITS, StatusRequest, learnTicketLinks, setTask, ticketProjects, type Attachment, type DeviceKey, type KeyCabinet, type OrphanedFloor, type OrphanedRoom, type TransferSource, type CommandBody, type CommandResult, type NewPost, type Pinned, type Post, type PostUpdate, type ReactionKind, type Snapshot, type StatusView, type TalkingState, type TicketLinks, type Uploaded, type Versions } from "@ruumble/protocol";
import edgeCases from "@ruumble/protocol/fixtures/edge-cases.json";
import sample from "@ruumble/protocol/fixtures/sample.json";
import unpaired from "@ruumble/protocol/fixtures/unpaired.json";
import vacant from "@ruumble/protocol/fixtures/vacant.json";
import type { AdapterEvents, BoardApi, BoardErrorCode, BoardResult, CareApi, KeysApi, MaintenanceApi, MumbleAdapter, PairApi, PluginStatus, StatusApi } from "./types.ts";

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
    // older than two weeks: something for "delete old posts" in room care
    [7, [post({ id: "m3", channelId: 7, kind: "text", authorName: "Clara", createdAt: now - 20 * 24 * 60 * MINUTE, updatedAt: now - 20 * 24 * 60 * MINUTE, text: "In a customer call from 2 pm." })]],
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

const DAY = 24 * 60 * MINUTE;
/** building settings as the service reports them without overrides (ADR-0016) */
/** a care action the service would refuse (caretaker turns it into the error) */
class Refused {
  constructor(readonly error: BoardErrorCode) {}
}

const MOCK_DEFAULTS: BuildingSettings = { retentionDays: 365, quotaMB: 2048, maxFileMB: BOARD_LIMITS.fileBytes / (1024 * 1024), graceDays: 7, notifyNewPosts: true };

/** paired browsers (key cabinet, ADR-0015): the own ones (first: this browser) and others' */
function sampleKeys(now: number): { mine: DeviceKey[]; others: KeyCabinet["others"] } {
  const key = (id: string, device: string, createdDays: number, usedDays: number | null, current = false): DeviceKey => ({
    id: id.padEnd(16, "0"), device, created: now - createdDays * DAY, lastUsed: usedDays === null ? null : now - usedDays * DAY, current,
  });
  return {
    mine: [key("a1", "Firefox on Linux", 40, 0, true), key("a2", "Safari on iOS", 12, 3), key("a3", "", 200, null)],
    others: [
      { name: "Ben", keys: [key("b1", "Chrome on Windows", 30, 0)] },
      { name: "Clara", keys: [key("c1", "Edge on Windows", 90, 1), key("c2", "Chrome on Android", 5, 5)] },
    ],
  };
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
  private keyring = sampleKeys(Date.now());
  private settings: BuildingSettings = { ...MOCK_DEFAULTS };
  readonly maintenance: MaintenanceApi = {
    load: async () => this.caretaker(0, () => ({ settings: this.settings, defaults: MOCK_DEFAULTS, usedBytes: this.usedBytes() }), true),
    save: async (next) =>
      this.caretaker(0, () => {
        if (!BuildingSettings.safeParse(next).success) return new Refused("invalid");
        this.settings = { ...next };
        return { settings: this.settings, defaults: MOCK_DEFAULTS, usedBytes: this.usedBytes() };
      }, true),
  };
  /** the own status (B): texts used last, and the timer that lets the current one expire */
  private recentStatus = ["In a meeting", "Lunch break", "Focus time, please write"];
  private statusTimer: ReturnType<typeof setTimeout> | null = null;
  readonly status: StatusApi = {
    load: async () => (this.me() ? { ok: true, value: this.statusView() } : { ok: false, error: "not-paired" }),
    set: async (text, minutes) => {
      const me = this.me();
      if (!me) return { ok: false, error: "not-paired" };
      const parsed = StatusRequest.safeParse({ text, minutes });
      if (!parsed.success) return { ok: false, error: "invalid" };
      const clean = parsed.data.text.replace(/\s+/g, " ");
      me.status = { text: clean, until: minutes === null ? null : Date.now() + minutes * MINUTE };
      this.recentStatus = [clean, ...this.recentStatus.filter((r) => r !== clean)].slice(0, STATUS_LIMITS.recent);
      if (this.statusTimer) clearTimeout(this.statusTimer);
      if (minutes !== null) this.statusTimer = setTimeout(() => this.clearStatus(), minutes * MINUTE);
      this.emit();
      return { ok: true, value: this.statusView() };
    },
    clear: async () => {
      if (!this.me()) return { ok: false, error: "not-paired" };
      this.clearStatus();
      return { ok: true, value: this.statusView() };
    },
  };
  readonly keys: KeysApi = {
    list: async () => {
      if (!this.me()) return { ok: false, error: "not-paired" };
      return { ok: true, value: { mine: this.keyring.mine, others: this.state.care?.includes(0) ? this.keyring.others : null } };
    },
    revoke: async (id) => {
      if (!this.me()) return { ok: false, error: "not-paired" };
      const current = this.keyring.mine.find((k) => k.id === id)?.current;
      const isMine = this.keyring.mine.some((k) => k.id === id);
      if (!isMine && !this.state.care?.includes(0)) return { ok: false, error: "forbidden" };
      this.keyring = {
        mine: this.keyring.mine.filter((k) => k.id !== id),
        others: (this.keyring.others ?? []).map((h) => ({ ...h, keys: h.keys.filter((k) => k.id !== id) })).filter((h) => h.keys.length > 0),
      };
      // like the service: revoking this browser's key unpairs it
      if (current) {
        this.paired = false;
        setTimeout(() => this.events?.connection("unpaired"), 0);
      }
      return { ok: true, value: true as const };
    },
  };
  readonly care: CareApi = {
    room: async (id) =>
      this.caretaker(id, () => {
        const posts = this.posts.get(id) ?? [];
        const times = posts.map((p) => p.createdAt).sort((a, b) => a - b);
        const now = Date.now();
        return {
          channelId: id, name: this.channelName(id), posts: posts.length, bytes: posts.reduce((n, p) => n + (p.attachment?.size ?? 0), 0),
          newest: times.at(-1) ?? null, oldest: times[0] ?? null, retentionDays: this.settings.retentionDays,
          olderThan: PRUNE_DAYS.map((days) => ({ days, posts: times.filter((t) => t < now - days * DAY).length })),
        };
      }, this.isRoom(id)),
    clearRoom: async (id) =>
      this.caretaker(id, () => {
        const posts = (this.posts.get(id) ?? []).length;
        this.posts.delete(id);
        this.pins.delete(id);
        if (posts) this.boardChanged(id);
        return { posts };
      }, this.isRoom(id)),
    pruneRoom: async (id, days) =>
      this.caretaker(id, () => {
        const list = this.posts.get(id) ?? [];
        const keep = list.filter((p) => p.createdAt >= Date.now() - days * DAY);
        this.posts.set(id, keep);
        if (keep.length !== list.length) this.boardChanged(id);
        return { posts: list.length - keep.length };
      }, this.isRoom(id)),
    exportRoom: async (id) =>
      // the mock has no ZIP: the board as Markdown is enough to see the download
      this.caretaker(id, () => {
        const posts = [...(this.posts.get(id) ?? [])].sort((a, b) => a.createdAt - b.createdAt);
        const md = [`# Board of "${this.channelName(id)}"`, "", ...posts.flatMap((p) => ["---", "", `## ${p.authorName} · ${new Date(p.createdAt).toISOString()}`, "", p.text, ""])].join("\n");
        return { stream: new Blob([md], { type: "text/markdown" }).stream(), name: `board-${this.channelName(id).replace(/[^\p{L}\p{N}._-]+/gu, "-")}.md` };
      }, this.isRoom(id)),
    floor: async (id) =>
      this.caretaker(id, () => ({
        channelId: id,
        name: this.channelName(id),
        graceDays: this.settings.graceDays,
        rooms: this.roomsOf(id).map((c) => {
          const posts = this.posts.get(c.id) ?? [];
          return { channelId: c.id, name: c.name, posts: posts.length, bytes: posts.reduce((n, p) => n + (p.attachment?.size ?? 0), 0), newest: posts.length ? Math.max(...posts.map((p) => p.createdAt)) : null };
        }),
        orphans: this.orphans.filter((o) => o.floorId === id).map((o) => o.room),
        sources: this.transferSources().filter((s) => this.state.care?.includes(s.floorId)).map(({ floorId: _, ...s }) => s),
      }), this.isFloor(id)),
    transfer: async (id, from, to) =>
      this.caretaker(id, () => {
        const target = this.state.channels.find((c) => c.id === to);
        if (target?.parent !== id || from === to) return new Refused("invalid");
        // like the service: a board with posts, and Write on the floor it comes from as well
        const source = this.transferSources().find((s) => s.channelId === from);
        if (!source) return new Refused("not-found");
        if (!this.state.care?.includes(source.floorId)) return new Refused("forbidden");
        const orphan = this.orphans.find((o) => o.room.channelId === from);
        const now = Date.now();
        // a gone room in the mock has only numbers: it brings that many notes
        const moved = orphan
          ? Array.from({ length: orphan.room.posts }, (_, i): Post => ({ id: `mock-${this.nextPostId++}`, channelId: to, kind: "text", text: `From "${orphan.room.name}" (${i + 1})`, authorName: "Ben", mine: false, canDelete: false, createdAt: now - i * MINUTE, updatedAt: now - i * MINUTE, reactions: [] }))
          : (this.posts.get(from) ?? []).map((p) => ({ ...p, channelId: to }));
        if (orphan) this.orphans = this.orphans.filter((o) => o !== orphan);
        else this.posts.delete(from);
        this.posts.set(to, [...(this.posts.get(to) ?? []), ...moved].sort((a, b) => b.createdAt - a.createdAt));
        this.boardChanged(to);
        return { posts: moved.length };
      }, this.isFloor(id)),
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
        const learned = this.learnedLinks();
        const roomBytes = (id: number) => (this.posts.get(id) ?? []).reduce((n, p) => n + (p.attachment?.size ?? 0), 0);
        const used = [...this.posts.keys()].reduce((n, id) => n + roomBytes(id), 0) + this.orphans.reduce((n, o) => n + o.room.bytes, 0);
        return {
          storage: { usedBytes: used, quotaBytes: this.settings.quotaMB * 1024 * 1024, retentionDays: this.settings.retentionDays, graceDays: this.settings.graceDays },
          floors: this.state.channels.filter((c) => c.parent === 0).sort((a, b) => a.position - b.position).map((f) => {
            const rooms = this.roomsOf(f.id).filter((r) => (this.posts.get(r.id) ?? []).length > 0);
            return { channelId: f.id, name: f.name, rooms: rooms.length, posts: rooms.reduce((n, r) => n + this.posts.get(r.id)!.length, 0), bytes: rooms.reduce((n, r) => n + roomBytes(r.id), 0) };
          }),
          orphans: [...floors.values()],
          tickets: Object.fromEntries(Object.keys(learned).sort().map((p) => [p, learned[p]!])),
        };
      }, true),
    cleanBuilding: async (floors) =>
      this.caretaker(0, () => this.removeOrphans((o) => floors.includes(o.floorId) && (o.floorId === null || !this.isFloor(o.floorId))), true),
    forgetTickets: async (projects) =>
      this.caretaker(0, () => {
        const now = Date.now();
        for (const p of projects) this.forgotten.set(p, now);
        for (const id of this.posts.keys()) this.boardChanged(id);
        return true as const;
      }, true),
  };
  readonly board: BoardApi = {
    load: async () =>
      this.boardRoom((channelId) => {
        const posts = this.posts.get(channelId) ?? [];
        // like the service: the pin goes away with its post
        const pin = this.pins.get(channelId);
        const pinned = pin && posts.some((p) => p.id === pin.postId) ? pin : null;
        return { channelId, channelName: this.channelName(channelId), posts, pinned, tickets: this.ticketLinks(posts), maxFileBytes: this.settings.maxFileMB * 1024 * 1024 };
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
      if (file.size > this.settings.maxFileMB * 1024 * 1024) return { ok: false, error: "too-large" };
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
    if (this.statusTimer) clearTimeout(this.statusTimer);
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
    this.keyring = sampleKeys(Date.now());
    this.settings = { ...MOCK_DEFAULTS };
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

  private usedBytes(): number {
    return [...this.posts.values()].flat().reduce((n, p) => n + (p.attachment?.size ?? 0), 0) + this.orphans.reduce((n, o) => n + o.room.bytes, 0);
  }

  private roomsOf(floorId: number) {
    return this.state.channels.filter((c) => c.parent === floorId && !c.temporary).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  }

  /** like the service: every room with posts, current or gone, with its floor */
  /** every board with posts, with the floor it is on (0: not known, like the service) */
  private transferSources(): (TransferSource & { floorId: number })[] {
    const current = [...this.posts].filter(([, posts]) => posts.length > 0).map(([id, posts]) => {
      const floor = this.state.channels.find((c) => c.id === this.state.channels.find((x) => x.id === id)?.parent);
      return { channelId: id, name: this.channelName(id), floorName: floor?.name ?? "", floorId: floor?.id ?? 0, posts: posts.length, gone: false };
    });
    const gone = this.orphans.map((o) => ({ channelId: o.room.channelId, name: o.room.name || `#${o.room.channelId}`, floorName: o.floorName, floorId: o.floorId ?? 0, posts: o.room.posts, gone: true }));
    return [...current, ...gone].sort((a, b) => a.floorName.localeCompare(b.floorName) || a.name.localeCompare(b.name));
  }

  private isRoom(id: number): boolean {
    const c = this.state.channels.find((x) => x.id === id);
    return !!c && !c.temporary && c.parent !== null && this.isFloor(c.parent);
  }

  /** like the service: Write permission on the channel (the snapshot's `care`), from anywhere in the building */
  private caretaker<T>(channelId: number, fn: () => T | Refused, exists: boolean): BoardResult<T> {
    if (this.plugin === "disconnected" || !this.me()) return { ok: false, error: "not-paired" };
    if (!exists) return { ok: false, error: "not-found" };
    if (!this.state.care?.includes(channelId)) return { ok: false, error: "forbidden" };
    const value = fn();
    return value instanceof Refused ? { ok: false, error: value.error } : { ok: true, value };
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

  private statusView(): StatusView {
    return { current: this.me()?.status ?? null, recent: this.recentStatus };
  }

  private clearStatus(): void {
    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.statusTimer = null;
    const me = this.me();
    if (me?.status) {
      delete me.status;
      this.emit();
    }
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
