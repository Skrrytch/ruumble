import { describe, expect, it } from "vitest";
import type { Post, Reaction } from "@ruumble/protocol";
import { t } from "../src/lib/i18n/index.svelte.ts";
import { PIN_TITLE_MAX, fileKind, filterPosts, formatSize, isLong, looksLikeCode, newestPost, parseSeen, pastedName, relativeTime, suggestTitle, summarizeReactions, unseenPosts } from "../src/lib/board/model.ts";

const post = (kind: Post["kind"], id: string = kind): Post => ({ id, channelId: 3, kind, text: "x", authorName: "A", mine: false, canDelete: false, createdAt: 0, updatedAt: 0, reactions: [] });

describe("Board model", () => {
  it("detects pasted source code, but not plain text", () => {
    expect(looksLikeCode("function f(a) {\n  return a + 1;\n}")).toBe(true);
    expect(looksLikeCode("import os\ndef main():\n    print(os.getcwd())")).toBe(true);
    expect(looksLikeCode('{\n  "name": "ruumble",\n  "version": "0.3.0"\n}')).toBe(true);
    expect(looksLikeCode("$ docker compose up -d\n$ docker ps")).toBe(true);
    expect(looksLikeCode("Hi all,\nwe meet at 10 o'clock.\nSee you then!")).toBe(false);
    expect(looksLikeCode("- Shopping\n- Tidy up\n- Test Mumble")).toBe(false);
    expect(looksLikeCode("const x = 1;")).toBe(false); // single line
    expect(looksLikeCode("```js\nconst a = 1;\nlet b = 2;\n```")).toBe(false); // already Markdown
  });

  it("relative time", () => {
    const now = 10 * 24 * 3600_000;
    expect(relativeTime(now - 20_000, now)).toBe("Just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(relativeTime(now - 3 * 3600_000, now)).toBe("3 hours ago");
    expect(relativeTime(now - 26 * 3600_000, now)).toBe("yesterday");
    expect(relativeTime(now - 4 * 24 * 3600_000, now)).toBe("4 days ago");
    expect(relativeTime(now + 5000, now)).toBe("Just now");
  });

  it("filter, count text", () => {
    const posts = [post("text"), post("code"), post("image"), post("text", "t2")];
    expect(filterPosts(posts, "all")).toHaveLength(4);
    expect(filterPosts(posts, "text").map((p) => p.id)).toEqual(["text", "t2"]);
    expect([0, 1, 2].map((n) => t().board.searchPlaceholder(n))).toEqual(["Search …", "Search 1 post …", "Search 2 posts …"]);
    expect([t().board.shown(1, 1), t().board.shown(0, 3)]).toEqual(["1 of 1 post", "0 of 3 posts"]);
  });

  it("search: all words, not case-sensitive, over text, file name, language and author, combined with the filter", () => {
    const posts: Post[] = [
      { ...post("text", "a"), text: "Deploy the **release** today", authorName: "Anna" },
      { ...post("code", "b"), text: "x = 1", language: "python", authorName: "Ben" },
      { ...post("file", "c"), text: "", attachment: { id: "0".repeat(64), name: "Server.log", mime: "text/plain", size: 1 }, authorName: "Clara" },
    ];
    expect(filterPosts(posts, "all", "").map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(filterPosts(posts, "all", "  RELEASE  deploy ").map((p) => p.id)).toEqual(["a"]);
    expect(filterPosts(posts, "all", "python").map((p) => p.id)).toEqual(["b"]);
    expect(filterPosts(posts, "all", "server.LOG").map((p) => p.id)).toEqual(["c"]);
    expect(filterPosts(posts, "all", "ben").map((p) => p.id)).toEqual(["b"]);
    expect(filterPosts(posts, "text", "python")).toEqual([]);
    expect(filterPosts(posts, "all", "release python")).toEqual([]);
  });

  it("reaction summary: three most frequent, ties in the fixed order, total and own", () => {
    const r = (kind: Reaction["kind"], count: number, mine = false): Reaction => ({ kind, count, names: [], mine });
    expect(summarizeReactions([])).toEqual({ top: [], total: 0, mine: false });
    expect(summarizeReactions([r("agree", 1), r("unclear", 3), r("done", 1), r("cheers", 2, true)])).toEqual({ top: ["unclear", "cheers", "agree"], total: 7, mine: true });
    expect(summarizeReactions([r("birthday", 1), r("agree", 1)], 1).top).toEqual(["agree"]);
  });

  it("title suggestion for keeping on top: heading, else first line, without Markdown, at most 40 characters (A3)", () => {
    const text = (t: string): Post => ({ ...post("text"), text: t });
    expect(suggestTitle(text("Intro line\n\n## Release **1.4**\n- [ ] Tag"))).toBe("Release 1.4");
    expect(suggestTitle(text("- [ ] Tag the [release](https://x.test)\n- [x] Changelog"))).toBe("Tag the release");
    expect(suggestTitle(text("> `quoted` _text_"))).toBe("quoted text");
    expect(suggestTitle(text("a".repeat(60)))).toBe(`${"a".repeat(PIN_TITLE_MAX - 1)}…`);
    expect(suggestTitle(text("**  **"))).toBe("Text"); // nothing left: the kind
    expect(suggestTitle({ ...post("code"), text: "# not a heading in code\nx = 1" })).toBe("# not a heading in code");
    expect(suggestTitle({ ...post("file"), text: "", attachment: { id: "0".repeat(64), name: "server.log", mime: "text/plain", size: 1 } })).toBe("server.log");
    expect(suggestTitle({ ...post("image"), text: "" })).toBe("Image");
  });

  it("long posts", () => {
    expect(isLong("a\n".repeat(9))).toBe(true);
    expect(isLong("short")).toBe(false);
    expect(isLong("x".repeat(700))).toBe(true);
  });
});

describe("Unseen posts", () => {
  const at = (id: string, createdAt: number, mine = false): Post => ({ ...post("text", id), createdAt, mine });

  it("newest post is the room's seen marker, 0 without posts", () => {
    expect(newestPost([at("a", 5), at("b", 9), at("c", 7)])).toBe(9);
    expect(newestPost([])).toBe(0);
  });

  it("only posts by others after the marker are unseen", () => {
    const posts = [at("new", 12), at("own", 13, true), at("same", 10), at("old", 4)];
    expect(unseenPosts(posts, 10).map((p) => p.id)).toEqual(["new"]);
    expect(unseenPosts(posts, 20)).toEqual([]);
  });

  it("reads the stored markers, ignoring junk", () => {
    expect(parseSeen('{"3":12,"7":5}')).toEqual({ "3": 12, "7": 5 });
    expect(parseSeen('{"3":"x","4":null,"5":8}')).toEqual({ "5": 8 });
    expect(parseSeen("[1,2]")).toEqual({});
    expect(parseSeen("null")).toEqual({});
    expect(parseSeen("{broken")).toEqual({});
    expect(parseSeen(null)).toEqual({});
  });
});

describe("Attachments (AP11.3)", () => {
  it("readable sizes", () => {
    expect([812, 34 * 1024, 1.25 * 1024 * 1024].map(formatSize)).toEqual(["812 B", "34 KB", "1.3 MB"]);
  });

  it("file kind by type and extension", () => {
    expect(fileKind("application/pdf")).toBe("pdf");
    expect(fileKind("application/octet-stream", "report.PDF")).toBe("pdf");
    expect(fileKind("application/zip")).toBe("archive");
    expect(fileKind("application/octet-stream", "log.tgz")).toBe("archive");
    expect(fileKind("text/csv")).toBe("text");
    expect(fileKind("application/json")).toBe("text");
    expect(fileKind("audio/ogg")).toBe("audio");
    expect(fileKind("video/mp4")).toBe("video");
    expect(fileKind("application/octet-stream", "setup.exe")).toBe("other");
    expect(fileKind("image/png", "x.png")).toBe("image");
    expect(fileKind("application/octet-stream")).toBe("other");
  });

  it("pasted images get a meaningful name", () => {
    const at = new Date(2026, 8, 28, 9, 5);
    expect(pastedName({ name: "image.png", type: "image/png" }, at)).toBe("image-2026-09-28-0905.png");
    expect(pastedName({ name: "", type: "image/jpeg" }, at)).toBe("image-2026-09-28-0905.jpg");
    expect(pastedName({ name: "holiday.jpg", type: "image/jpeg" }, at)).toBe("holiday.jpg");
    expect(pastedName({ name: "blob", type: "" }, at)).toBe("image-2026-09-28-0905.png");
  });
});
