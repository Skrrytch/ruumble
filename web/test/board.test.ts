import { describe, expect, it } from "vitest";
import type { Post } from "@ruumble/protocol";
import { t } from "../src/lib/i18n/index.svelte.ts";
import { fileKind, filterPosts, formatSize, isLong, looksLikeCode, pastedName, relativeTime } from "../src/lib/board/model.ts";

const post = (kind: Post["kind"], id: string = kind): Post => ({ id, channelId: 3, kind, text: "x", authorName: "A", mine: false, canDelete: false, createdAt: 0, updatedAt: 0 });

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

  it("filter, count text, long posts", () => {
    const posts = [post("text"), post("code"), post("image"), post("text", "t2")];
    expect(filterPosts(posts, "all")).toHaveLength(4);
    expect(filterPosts(posts, "text").map((p) => p.id)).toEqual(["text", "t2"]);
    expect([0, 1, 2].map((n) => t().board.count(n))).toEqual(["No posts yet", "1 post", "2 posts"]);
    expect(isLong("a\n".repeat(9))).toBe(true);
    expect(isLong("short")).toBe(false);
    expect(isLong("x".repeat(700))).toBe(true);
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
