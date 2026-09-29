// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { highlight, renderCode, renderInline, renderMarkdown } from "../src/lib/board/render.ts";

describe("Rendering: Markdown and code without XSS (ADR-0011)", () => {
  it("renders common Markdown", () => {
    const html = renderMarkdown("## Title\n\n- **bold** and *italic*\n- `code`\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<h2>Title</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<table>");
  });

  it.each([
    ["raw HTML", "<script>alert(1)</script><img src=x onerror=alert(1)>"],
    ["HTML link", '<a href="javascript:alert(1)">x</a>'],
    ["Markdown link with javascript:", "[click](javascript:alert(1))"],
    ["Markdown link with data:", "[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)"],
    ["image with onerror", '![x](x" onerror="alert(1))'],
    ["iframe", "<iframe src=//evil></iframe>"],
  ])("%s is defused", (_name, input) => {
    const html = renderMarkdown(input);
    const doc = new DOMParser().parseFromString(html, "text/html");
    // what matters is what the browser sees as elements and attributes (escaped text is harmless)
    expect(doc.querySelectorAll("script, iframe, img, object, embed, svg, style").length).toBe(0);
    for (const el of doc.body.querySelectorAll("*")) {
      for (const attr of el.attributes) expect(attr.name).not.toMatch(/^on/i);
    }
    for (const a of doc.querySelectorAll("a")) expect(a.getAttribute("href") ?? "").toMatch(/^(https?:|mailto:|$)/);
  });

  it("links open in a new tab without access to the window", () => {
    const html = renderMarkdown("https://example.org");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it("code is highlighted and escaped, language detected", () => {
    const r = renderCode('<script>alert("x")</script>', "xml");
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;");
    // auto-detection needs some context; for short snippets code mode offers the language selection
    expect(highlight("import os\n\ndef main():\n    print(os.getcwd())\n\nif __name__ == '__main__':\n    main()", undefined).language).toBe("python");
    expect(highlight("SELECT name FROM users WHERE id = 1;", "sql").language).toBe("sql");
    expect(highlight("x", "does-not-exist").language).not.toBe("does-not-exist");
  });

  it.each([
    ["python", "def main():\n    print('hello')"],
    ["json", '{"a": [1, 2], "b": true}'],
    ["xml", "<svg><rect width=\"1\"/></svg>"],
    ["sql", "SELECT id, name FROM users WHERE active = 1"],
    ["bash", "$ docker compose up -d\n$ docker ps"],
    ["typescript", "export interface User { name: string }\nconst u: User = { name: 'x' };"],
    ["javascript", "const add = (a, b) => a + b;\nconsole.log(add(1, 2));"],
    ["css", ".room { color: red; margin: 0; }"],
    ["diff", "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new"],
  ])("detects %s", (lang, code) => {
    expect(highlight(code).language).toBe(lang);
  });
});

describe("Language detection", () => {
  it.each([
    ['{ "a": 1, "b": [2, 3] }', "json"],
    ['<div class="x">\n  <p>Hello</p>\n</div>', "xml"],
    ["def greet(name):\n    return name", "python"],
    ["SELECT id, name\nFROM users\nWHERE id = 1", "sql"],
    ["FROM node:22\nRUN npm ci\nCMD [\"node\", \"main.js\"]", "dockerfile"],
    ["$ ls -la\n$ cd /tmp", "bash"],
    ["diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@", "diff"],
    ["interface User { name: string }\nexport const u: User = { name: 'a' };", "typescript"],
    ["const add = (a, b) => a + b;\nconsole.log(add(1, 2));", "javascript"],
    ["package main\n\nfunc main() {\n}", "go"],
    ["fn main() {\n    let mut x = 1;\n    println!(\"{}\", x);\n}", "rust"],
    ["public class App {\n  private int x;\n}", "java"],
    ["services:\n  web:\n    image: nginx\n    ports:\n      - 80:80", "yaml"],
    [".card > .title {\n  color: red;\n  margin: 0;\n}", "css"],
  ])("%s → %s", (code, language) => {
    expect(highlight(code).language).toBe(language);
  });

  it("invalid JSON is not JSON, chosen language wins, unknown stays escaped text", () => {
    expect(highlight("{ broken").language).not.toBe("json");
    expect(highlight("x = 1", "python").language).toBe("python");
    expect(highlight("x = 1", "does-not-exist").language).not.toBe("does-not-exist");
    expect(highlight("Hello <World>")).toEqual({ html: "Hello &lt;World&gt;", language: "" });
  });
});

describe("Task texts (A2)", () => {
  it("inline Markdown for task texts: links and code, no blocks, sanitised", () => {
    const html = renderInline("Review `api.ts` in https://example.test/pr/1 **now**");
    expect(html).toContain("<code>api.ts</code>");
    expect(html).toContain('<a href="https://example.test/pr/1"');
    expect(html).toContain("<strong>now</strong>");
    expect(html).not.toContain("<p>");
    const unsafe = renderInline("[x](javascript:alert(1)) <img src=x onerror=alert(1)>");
    expect(unsafe).not.toContain("<a");
    expect(unsafe).not.toContain("<img"); // shown as text, escaped
  });
});
