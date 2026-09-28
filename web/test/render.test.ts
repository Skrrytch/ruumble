// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { highlight, renderCode, renderMarkdown } from "../src/lib/board/render.ts";

describe("Darstellung: Markdown und Code ohne XSS (ADR-0011)", () => {
  it("rendert gängiges Markdown", () => {
    const html = renderMarkdown("## Titel\n\n- **fett** und *kursiv*\n- `code`\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<h2>Titel</h2>");
    expect(html).toContain("<strong>fett</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<table>");
  });

  it.each([
    ["rohes HTML", "<script>alert(1)</script><img src=x onerror=alert(1)>"],
    ["HTML-Link", '<a href="javascript:alert(1)">x</a>'],
    ["Markdown-Link mit javascript:", "[klick](javascript:alert(1))"],
    ["Markdown-Link mit data:", "[klick](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)"],
    ["Bild mit onerror", '![x](x" onerror="alert(1))'],
    ["iframe", "<iframe src=//evil></iframe>"],
  ])("%s wird entschärft", (_name, input) => {
    const html = renderMarkdown(input);
    const doc = new DOMParser().parseFromString(html, "text/html");
    // entscheidend ist, was der Browser als Elemente und Attribute sieht (maskierter Text ist harmlos)
    expect(doc.querySelectorAll("script, iframe, img, object, embed, svg, style").length).toBe(0);
    for (const el of doc.body.querySelectorAll("*")) {
      for (const attr of el.attributes) expect(attr.name).not.toMatch(/^on/i);
    }
    for (const a of doc.querySelectorAll("a")) expect(a.getAttribute("href") ?? "").toMatch(/^(https?:|mailto:|$)/);
  });

  it("Links öffnen in neuem Tab ohne Zugriff auf das Fenster", () => {
    const html = renderMarkdown("https://example.org");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it("Code wird hervorgehoben und maskiert, Sprache erkannt", () => {
    const r = renderCode('<script>alert("x")</script>', "xml");
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;");
    // Auto-Erkennung braucht etwas Kontext; für kurze Stücke gibt es im Code-Modus die Sprachauswahl
    expect(highlight("import os\n\ndef main():\n    print(os.getcwd())\n\nif __name__ == '__main__':\n    main()", undefined).language).toBe("python");
    expect(highlight("SELECT name FROM users WHERE id = 1;", "sql").language).toBe("sql");
    expect(highlight("x", "gibt-es-nicht").language).not.toBe("gibt-es-nicht");
  });

  it.each([
    ["python", "def main():\n    print('hallo')"],
    ["json", '{"a": [1, 2], "b": true}'],
    ["xml", "<svg><rect width=\"1\"/></svg>"],
    ["sql", "SELECT id, name FROM users WHERE active = 1"],
    ["bash", "$ docker compose up -d\n$ docker ps"],
    ["typescript", "export interface User { name: string }\nconst u: User = { name: 'x' };"],
    ["javascript", "const add = (a, b) => a + b;\nconsole.log(add(1, 2));"],
    ["css", ".room { color: red; margin: 0; }"],
    ["diff", "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-alt\n+neu"],
  ])("erkennt %s", (lang, code) => {
    expect(highlight(code).language).toBe(lang);
  });
});
