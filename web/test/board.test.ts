import { describe, expect, it } from "vitest";
import type { Post } from "@ruumble/protocol";
import { countLabel, fileKind, filterPosts, formatSize, isLong, looksLikeCode, pastedName, relativeTime } from "../src/lib/board/model.ts";

const post = (kind: Post["kind"], id: string = kind): Post => ({ id, channelId: 3, kind, text: "x", authorName: "A", mine: false, canDelete: false, createdAt: 0, updatedAt: 0 });

describe("Pinnwand-Modell", () => {
  it("erkennt Quellcode beim Einfügen, aber keinen normalen Text", () => {
    expect(looksLikeCode("function f(a) {\n  return a + 1;\n}")).toBe(true);
    expect(looksLikeCode("import os\ndef main():\n    print(os.getcwd())")).toBe(true);
    expect(looksLikeCode('{\n  "name": "ruumble",\n  "version": "0.3.0"\n}')).toBe(true);
    expect(looksLikeCode("$ docker compose up -d\n$ docker ps")).toBe(true);
    expect(looksLikeCode("Hallo zusammen,\nwir treffen uns um 10 Uhr.\nBis dann!")).toBe(false);
    expect(looksLikeCode("- Einkaufen\n- Aufräumen\n- Mumble testen")).toBe(false);
    expect(looksLikeCode("const x = 1;")).toBe(false); // einzeilig
    expect(looksLikeCode("```js\nconst a = 1;\nlet b = 2;\n```")).toBe(false); // schon Markdown
  });

  it("relative Zeit", () => {
    const now = 10 * 24 * 3600_000;
    expect(relativeTime(now - 20_000, now)).toBe("Gerade eben");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("vor 5 Min.");
    expect(relativeTime(now - 3 * 3600_000, now)).toBe("vor 3 Std.");
    expect(relativeTime(now - 26 * 3600_000, now)).toBe("gestern");
    expect(relativeTime(now - 4 * 24 * 3600_000, now)).toBe("vor 4 Tagen");
    expect(relativeTime(now + 5000, now)).toBe("Gerade eben");
  });

  it("Filter, Zähltext, lange Beiträge", () => {
    const posts = [post("text"), post("code"), post("image"), post("text", "t2")];
    expect(filterPosts(posts, "all")).toHaveLength(4);
    expect(filterPosts(posts, "text").map((p) => p.id)).toEqual(["text", "t2"]);
    expect([0, 1, 2].map(countLabel)).toEqual(["Noch keine Beiträge", "1 Beitrag", "2 Beiträge"]);
    expect(isLong("a\n".repeat(9))).toBe(true);
    expect(isLong("kurz")).toBe(false);
    expect(isLong("x".repeat(700))).toBe(true);
  });
});

describe("Anhänge (AP11.3)", () => {
  it("Größen lesbar", () => {
    expect([812, 34 * 1024, 1.25 * 1024 * 1024].map(formatSize)).toEqual(["812 B", "34 KB", "1,3 MB"]);
  });

  it("Dateiart nach Typ und Endung", () => {
    expect(fileKind("application/pdf")).toBe("pdf");
    expect(fileKind("application/octet-stream", "bericht.PDF")).toBe("pdf");
    expect(fileKind("application/zip")).toBe("archive");
    expect(fileKind("application/octet-stream", "log.tgz")).toBe("archive");
    expect(fileKind("text/csv")).toBe("text");
    expect(fileKind("application/json")).toBe("text");
    expect(fileKind("audio/ogg")).toBe("audio");
    expect(fileKind("video/mp4")).toBe("video");
    expect(fileKind("application/octet-stream", "setup.exe")).toBe("other");
  });

  it("eingefügte Bilder bekommen einen sprechenden Namen", () => {
    const at = new Date(2026, 8, 28, 9, 5);
    expect(pastedName({ name: "image.png", type: "image/png" }, at)).toBe("bild-2026-09-28-0905.png");
    expect(pastedName({ name: "", type: "image/jpeg" }, at)).toBe("bild-2026-09-28-0905.jpg");
    expect(pastedName({ name: "urlaub.jpg", type: "image/jpeg" }, at)).toBe("urlaub.jpg");
  });
});
