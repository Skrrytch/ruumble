/**
 * Darstellung von Beiträgen (ADR-0011): Markdown ohne rohes HTML (markdown-it, html: false),
 * danach DOMPurify. Code mit highlight.js (nur gängige Sprachen, damit das Bündel klein bleibt).
 * Der Dienst liefert nur Rohtext; HTML entsteht ausschließlich hier und immer bereinigt.
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

const LANGUAGES = { bash, cpp, csharp, css, diff, dockerfile, go, ini, java, javascript, json, kotlin, markdown, php, python, rust, sql, typescript, xml, yaml };
for (const [name, lang] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, lang);

/** Auswahl im Code-Modus (leer = automatisch erkennen) */
export const CODE_LANGUAGES = Object.keys(LANGUAGES).sort();

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Sprache an typischen Merkmalen erkennen. Die Auto-Erkennung von highlight.js ist dafür zu unzuverlässig:
 * Die CSS-Grammatik gewinnt oft sogar bei eindeutigem Python (getestet mit highlight.js 11.12).
 */
function guessLanguage(code: string): string | null {
  const t = code.trim();
  if (/^[\[{]/.test(t)) {
    try {
      JSON.parse(t);
      return "json";
    } catch {
      /* kein JSON */
    }
  }
  if (/^\s*<(\?xml|!doctype|[a-z][\w-]*[\s>])/i.test(t) && /<\/[a-z]/i.test(t)) return "xml";
  if (/^\s*(def |class \w+(\(.*\))?:|from \w+(\.\w+)* import |import \w+\s*$)/m.test(t) && !/[;{}]\s*$/m.test(t)) return "python";
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|WITH)\b[\s\S]*\b(FROM|INTO|SET|TABLE|WHERE|AS)\b/i.test(t)) return "sql";
  if (/^\s*(FROM|RUN|COPY|CMD|ENTRYPOINT|WORKDIR)\s/m.test(t) && /^FROM\s/m.test(t)) return "dockerfile";
  if (/^\s*[$#] \S/m.test(t) || /^#!\/(usr\/)?bin\/(env )?(ba)?sh/.test(t)) return "bash";
  if (/^(diff --git|--- |\+\+\+ |@@ )/m.test(t)) return "diff";
  // Go und Rust vor TypeScript/JavaScript: `let`, `const` und `=>` kommen dort auch vor
  if (/^\s*package\s+\w+/m.test(t) && /\bfunc\s/.test(t)) return "go";
  if (/\bfn\s+\w+\s*\(|\blet\s+mut\b|println!/.test(t)) return "rust";
  if (/\b(interface|type)\s+\w+.*[{=]|:\s*(string|number|boolean)\b/.test(t) && /\b(const|let|function|export|import)\b/.test(t)) return "typescript";
  if (/\b(function|const|let|var|=>|console\.log|require\(|export default)\b/.test(t)) return "javascript";
  if (/^\s*(public|private|protected)?\s*(static\s+)?(class|interface|void|record)\b/m.test(t) && /;\s*$/m.test(t)) return "java";
  if (/^\s*[\w-]+:\s+\S/m.test(t) && !/[;{}]/.test(t) && /^\s*-\s|^\s{2,}[\w-]+:/m.test(t)) return "yaml";
  if (/^\s*[.#]?[\w-]+(\s*[,>+~]\s*[.#]?[\w-]+)*\s*\{[^}]*:[^}]*;[^}]*\}/m.test(t)) return "css";
  return null;
}

/** Sprachen, die bei der Auto-Erkennung zu oft fälschlich gewinnen (nur über guessLanguage oder Auswahl) */
const AUTO_EXCLUDED = new Set(["css", "markdown", "ini"]);

/** Code hervorheben; liefert HTML (von highlight.js maskiert) und die erkannte Sprache */
export function highlight(code: string, language?: string): { html: string; language: string } {
  const chosen = language && hljs.getLanguage(language) ? language : guessLanguage(code);
  if (chosen) return { html: hljs.highlight(code, { language: chosen }).value, language: chosen };
  const auto = hljs.highlightAuto(code, CODE_LANGUAGES.filter((l) => !AUTO_EXCLUDED.has(l)));
  return auto.language && auto.relevance >= 5 ? { html: auto.value, language: auto.language } : { html: escape(code), language: "" };
}

const md = new MarkdownIt({
  html: false, // rohes HTML im Markdown bleibt Text
  linkify: true,
  breaks: true,
  highlight: (code, lang) => `<pre class="hljs"><code>${highlight(code, lang || undefined).html}</code></pre>`,
});

// Links immer in neuem Tab und ohne Zugriff auf dieses Fenster
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
});

const PURIFY = {
  ALLOWED_TAGS: ["p", "br", "strong", "em", "s", "del", "code", "pre", "blockquote", "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "table", "thead", "tbody", "tr", "th", "td", "span"],
  ALLOWED_ATTR: ["href", "class", "target", "rel"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i, // kein javascript:, data:, vbscript:
};

/** Markdown → bereinigtes HTML */
export function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(md.render(text), PURIFY) as string;
}

/** Code-Beitrag → bereinigtes HTML (Zeilen einzeln für Zeilennummern per CSS) */
export function renderCode(text: string, language?: string): { html: string; language: string } {
  const { html, language: detected } = highlight(text, language);
  return { html: DOMPurify.sanitize(html, { ALLOWED_TAGS: ["span"], ALLOWED_ATTR: ["class"] }) as string, language: detected };
}
