/**
 * Rendering of posts (ADR-0011): Markdown without raw HTML (markdown-it, html: false),
 * then DOMPurify. Code with highlight.js (only common languages, so the bundle stays small).
 * The service only delivers raw text; HTML is produced exclusively here and always sanitised.
 */
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import MarkdownIt from "markdown-it";
import { splitTickets, type TicketLinks } from "@ruumble/protocol";
import { describeLink } from "./links.ts";

const LANGUAGES = { bash, cpp, csharp, css, diff, dockerfile, go, ini, java, javascript, json, kotlin, markdown, php, python, rust, sql, typescript, xml, yaml };
for (const [name, lang] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, lang);

/** Selection in code mode (empty = detect automatically) */
export const CODE_LANGUAGES = Object.keys(LANGUAGES).sort();

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Detect the language by typical features. highlight.js auto-detection is too unreliable for this:
 * the CSS grammar often wins even for unambiguous Python (tested with highlight.js 11.12).
 */
function guessLanguage(code: string): string | null {
  const t = code.trim();
  if (/^[\[{]/.test(t)) {
    try {
      JSON.parse(t);
      return "json";
    } catch {
      /* not JSON */
    }
  }
  if (/^\s*<(\?xml|!doctype|[a-z][\w-]*[\s>])/i.test(t) && /<\/[a-z]/i.test(t)) return "xml";
  if (/^\s*(def |class \w+(\(.*\))?:|from \w+(\.\w+)* import |import \w+\s*$)/m.test(t) && !/[;{}]\s*$/m.test(t)) return "python";
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|WITH)\b[\s\S]*\b(FROM|INTO|SET|TABLE|WHERE|AS)\b/i.test(t)) return "sql";
  if (/^\s*(FROM|RUN|COPY|CMD|ENTRYPOINT|WORKDIR)\s/m.test(t) && /^FROM\s/m.test(t)) return "dockerfile";
  if (/^\s*[$#] \S/m.test(t) || /^#!\/(usr\/)?bin\/(env )?(ba)?sh/.test(t)) return "bash";
  if (/^(diff --git|--- |\+\+\+ |@@ )/m.test(t)) return "diff";
  // Go and Rust before TypeScript/JavaScript: `let`, `const` and `=>` occur there too
  if (/^\s*package\s+\w+/m.test(t) && /\bfunc\s/.test(t)) return "go";
  if (/\bfn\s+\w+\s*\(|\blet\s+mut\b|println!/.test(t)) return "rust";
  if (/\b(interface|type)\s+\w+.*[{=]|:\s*(string|number|boolean)\b/.test(t) && /\b(const|let|function|export|import)\b/.test(t)) return "typescript";
  if (/\b(function|const|let|var|=>|console\.log|require\(|export default)\b/.test(t)) return "javascript";
  if (/^\s*(public|private|protected)?\s*(static\s+)?(class|interface|void|record)\b/m.test(t) && /;\s*$/m.test(t)) return "java";
  if (/^\s*[\w-]+:\s+\S/m.test(t) && !/[;{}]/.test(t) && /^\s*-\s|^\s{2,}[\w-]+:/m.test(t)) return "yaml";
  if (/^\s*[.#]?[\w-]+(\s*[,>+~]\s*[.#]?[\w-]+)*\s*\{[^}]*:[^}]*;[^}]*\}/m.test(t)) return "css";
  return null;
}

/** Languages that win auto-detection wrongly too often (only via guessLanguage or selection) */
const AUTO_EXCLUDED = new Set(["css", "markdown", "ini"]);

/** Highlight code; returns HTML (escaped by highlight.js) and the detected language */
export function highlight(code: string, language?: string): { html: string; language: string } {
  const chosen = language && hljs.getLanguage(language) ? language : guessLanguage(code);
  if (chosen) return { html: hljs.highlight(code, { language: chosen }).value, language: chosen };
  const auto = hljs.highlightAuto(code, CODE_LANGUAGES.filter((l) => !AUTO_EXCLUDED.has(l)));
  return auto.language && auto.relevance >= 5 ? { html: auto.value, language: auto.language } : { html: escape(code), language: "" };
}

const md = new MarkdownIt({
  html: false, // raw HTML in Markdown stays text
  linkify: true,
  breaks: true,
  highlight: (code, lang) => `<pre class="hljs"><code>${highlight(code, lang || undefined).html}</code></pre>`,
});

/**
 * Ticket keys of learned projects ("TAG-1366") become links (tickets.ts in the protocol). Runs after linkify on
 * the text tokens only, so keys in code, inside links and in URLs stay as they are.
 */
md.core.ruler.push("tickets", (state) => {
  const links = (state.env as { tickets?: TicketLinks }).tickets;
  if (!links) return;
  for (const block of state.tokens) {
    if (block.type !== "inline" || !block.children) continue;
    let inLink = 0;
    block.children = block.children.flatMap((token) => {
      if (token.type === "link_open") inLink++;
      if (token.type === "link_close") inLink--;
      const parts = token.type === "text" && inLink === 0 ? splitTickets(token.content, links) : null;
      if (!parts) return [token];
      return parts.flatMap((part) => {
        const text = new state.Token("text", "", 0);
        text.content = part.text;
        if (!part.href) return [text];
        const open = new state.Token("link_open", "a", 1);
        open.attrs = [["href", part.href], ["class", "ticket"]];
        return [open, text, new state.Token("link_close", "a", -1)];
      });
    });
  }
});

/**
 * Bare URLs that linkify turned into links show their short form (A5, links.ts), the full URL as tooltip.
 * Only links written out with http(s)://; "example.com" and Markdown links with their own text stay as written.
 */
md.core.ruler.push("short-links", (state) => {
  for (const block of state.tokens) {
    const children = block.type === "inline" ? block.children : null;
    children?.forEach((token, i) => {
      const text = children[i + 1];
      if (token.type !== "link_open" || token.markup !== "linkify" || text?.type !== "text") return;
      const href = String(token.attrGet("href") ?? "");
      const info = /^https?:\/\//i.test(text.content) ? describeLink(href) : null;
      if (!info) return;
      text.content = info.label;
      token.attrSet("title", href);
      token.attrJoin("class", `link-${info.kind}`);
    });
  }
});

// Links always in a new tab and without access to this window
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
});

const PURIFY = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "s", "del", "code", "pre", "blockquote", "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "table", "thead", "tbody", "tr", "th", "td", "span"],
  ALLOWED_ATTR: ["href", "class", "target", "rel", "title"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i, // no javascript:, data:, vbscript:
};

/** Markdown → sanitised HTML; `tickets`: learned ticket links of the room */
export function renderMarkdown(text: string, tickets?: TicketLinks): string {
  return DOMPurify.sanitize(md.render(text, { tickets }), PURIFY) as string;
}

/** one line of Markdown without block elements (task of a task list, A2) → sanitised HTML */
export function renderInline(text: string, tickets?: TicketLinks): string {
  return DOMPurify.sanitize(md.renderInline(text, { tickets }), PURIFY) as string;
}

/** http(s) URLs written out in a text, in order, with their position (A4); no fuzzy links like "example.com" */
export function findLinks(text: string): { url: string; index: number; lastIndex: number }[] {
  return (md.linkify.match(text) ?? []).filter((m) => /^https?:$/i.test(m.schema)).map(({ url, index, lastIndex }) => ({ url, index, lastIndex }));
}

/** the distinct http(s) URLs of a text, in order of appearance */
export function uniqueLinks(text: string): string[] {
  return [...new Set(findLinks(text).map((m) => m.url))];
}

/**
 * URLs in highlighted code become links (A4). The positions come from the plain code and are mapped onto the
 * text nodes of the highlighted HTML, so a URL that highlight.js split across several spans links in full.
 */
function linkCode(html: string, code: string): string {
  // the HTML parser turns CR LF into LF, so the positions are taken from the code with LF only
  const links = findLinks(code.replace(/\r\n?/g, "\n"));
  if (!links.length) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  let offset = 0;
  for (const node of nodes) {
    const start = offset, end = offset + node.data.length;
    offset = end;
    // from the back, so the split does not move the parts still to come
    for (const link of links.filter((l) => l.index < end && l.lastIndex > start).reverse()) {
      const from = Math.max(link.index, start) - start, to = Math.min(link.lastIndex, end) - start;
      const tail = node.splitText(from);
      tail.splitText(to - from);
      const a = document.createElement("a");
      a.href = link.url;
      a.className = "code-link";
      tail.replaceWith(a);
      a.append(tail);
    }
  }
  return template.innerHTML;
}

/** Code post → sanitised HTML (lines separately for line numbers via CSS); URLs in it are links */
export function renderCode(text: string, language?: string): { html: string; language: string } {
  const { html, language: detected } = highlight(text, language);
  return {
    html: DOMPurify.sanitize(linkCode(html, text), { ALLOWED_TAGS: ["span", "a"], ALLOWED_ATTR: ["class", "href", "target", "rel"], ALLOWED_URI_REGEXP: /^https?:/i }) as string,
    language: detected,
  };
}
