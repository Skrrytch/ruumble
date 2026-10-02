/**
 * Short form of well-known URLs (A5): a kind for the icon and a short label, derived only from the shape of the
 * URL, never by fetching it. The path is recognised, not the host, so self-hosted GitLab, Gitea, Jira or
 * Confluence work the same as the public ones. Labels are language-neutral developer terms.
 */

export type LinkKind = "pr" | "issue" | "commit" | "ci" | "ticket" | "page" | "question" | "other";

export interface LinkInfo {
  kind: LinkKind;
  label: string;
}

/** longest label for other links before the path is shortened in the middle */
const MAX_OTHER = 40;

const decode = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
};

/** slug or title from a path segment: "how-to-x" → "How to x", "Deployment+Guide" → "Deployment Guide" */
function title(segment: string, dashes: boolean): string {
  const t = decode(segment).replace(dashes ? /[-_]+/g : /_+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** rules in order: the first match wins; `repo` is the segment the label names */
const RULES: { re: RegExp; info: (m: RegExpExecArray) => LinkInfo }[] = [
  // GitHub, Gitea/Forgejo (`pulls`), Bitbucket (`pull-requests`)
  { re: /\/([^/]+)\/(?:pull|pulls|pull-requests)\/(\d+)(?:\/|$)/, info: (m) => ({ kind: "pr", label: `PR #${m[2]} · ${m[1]}` }) },
  { re: /\/([^/]+)\/-\/merge_requests\/(\d+)(?:\/|$)/, info: (m) => ({ kind: "pr", label: `MR !${m[2]} · ${m[1]}` }) },
  { re: /\/([^/]+)\/(?:-\/)?issues\/(\d+)(?:\/|$)/, info: (m) => ({ kind: "issue", label: `#${m[2]} · ${m[1]}` }) },
  { re: /\/([^/]+)\/(?:-\/)?commits?\/([0-9a-f]{7,40})(?:\/|$)/i, info: (m) => ({ kind: "commit", label: `${m[2]!.slice(0, 7).toLowerCase()} · ${m[1]}` }) },
  { re: /\/([^/]+)\/actions\/runs\/\d+(?:\/|$)/, info: (m) => ({ kind: "ci", label: `CI · ${m[1]}` }) },
  { re: /\/([^/]+)\/-\/(pipelines|jobs)\/(\d+)(?:\/|$)/, info: (m) => ({ kind: "ci", label: `${m[2] === "jobs" ? "Job" : "Pipeline"} #${m[3]} · ${m[1]}` }) },
  // Jenkins: …/job/<folder>/job/<name>/<build>/
  { re: /\/job\/([^/]+)\/(\d+)(?:\/|$)/, info: (m) => ({ kind: "ci", label: `Build #${m[2]} · ${decode(m[1]!)}` }) },
  { re: /\/browse\/([A-Z][A-Z0-9]{1,9}-\d+)(?:\/|$)/, info: (m) => ({ kind: "ticket", label: m[1]! }) },
  // Confluence Cloud and Data Center: …/spaces/<S>/pages/<id>/<Title>, older …/display/<S>/<Title>
  { re: /\/spaces\/[^/]+\/pages\/\d+\/([^/]+)/, info: (m) => ({ kind: "page", label: title(m[1]!, false) }) },
  { re: /\/display\/[^/]+\/([^/]+)/, info: (m) => ({ kind: "page", label: title(m[1]!, false) }) },
  // Stack Overflow and the other Stack Exchange sites
  { re: /\/questions\/\d+\/([^/]+)/, info: (m) => ({ kind: "question", label: title(m[1]!, true) }) },
];

/** host and path, the path shortened in the middle ("firma.de/docs/…/setup") if it is long */
function other(url: URL): string {
  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean).map(decode);
  let label = [host, ...parts].join("/");
  if (label.length > MAX_OTHER && parts.length > 2) label = [host, parts[0], "…", parts.at(-1)].join("/");
  return label.length > MAX_OTHER ? `${label.slice(0, MAX_OTHER - 1)}…` : label;
}

/** kind and short label of an http(s) URL; `null` for anything else */
export function describeLink(href: string): LinkInfo | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  for (const rule of RULES) {
    const m = rule.re.exec(url.pathname);
    if (m) return rule.info(m);
  }
  return { kind: "other", label: other(url) };
}
