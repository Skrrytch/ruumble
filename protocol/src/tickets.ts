/**
 * Ticket keys (learned links): a post linking `https://jira.example/browse/TAG-1366` teaches the service that
 * the project `TAG` lives at `https://jira.example/browse/`. After that, a plain "TAG-1366" becomes a link.
 * Shared by service (learning) and web UI (rendering), so both recognise the same keys. Only the shape of the
 * URL counts; nothing is ever fetched, and Jira itself needs no configuration.
 */

/** project → base URL ending in `/browse/`, the key is appended */
export type TicketLinks = Record<string, string>;

/** project part of a key: an uppercase letter, then 1–9 uppercase letters or digits (`TAG`, `VKB2`) */
export const TICKET_PROJECT = /^[A-Z][A-Z0-9]{1,9}$/;

/** a link to an issue; no `?` or `#` before `/browse/`, so a URL hidden in a query string does not count */
const ISSUE_URL = /https?:\/\/[^\s<>()[\]{}"'`?#]+?\/browse\/([A-Z][A-Z0-9]{1,9})-[1-9]\d{0,6}(?![\w-])/g;

/** a plain key, not part of a word, path or longer key (`/browse/TAG-1`, `x.TAG-1`, `TAG-1-2` do not count) */
const KEY = /(?<![\w./-])([A-Z][A-Z0-9]{1,9})-([1-9]\d{0,6})(?![\w-]|\.\w)/g;

/** issue links in a text: the first base per project wins */
export function learnTicketLinks(text: string, into: TicketLinks = {}): TicketLinks {
  for (const m of text.matchAll(ISSUE_URL)) {
    const project = m[1]!;
    if (!(project in into)) into[project] = m[0].slice(0, m[0].lastIndexOf("/browse/") + "/browse/".length);
  }
  return into;
}

/** projects of the plain keys in a text */
export function ticketProjects(text: string, into: Set<string> = new Set()): Set<string> {
  for (const m of text.matchAll(KEY)) into.add(m[1]!);
  return into;
}

export interface TicketPart {
  text: string;
  /** set for a known key */
  href?: string;
}

/** split a text into plain parts and keys of known projects; null if there is no known key */
export function splitTickets(text: string, links: TicketLinks): TicketPart[] | null {
  const parts: TicketPart[] = [];
  let last = 0;
  for (const m of text.matchAll(KEY)) {
    const base = Object.hasOwn(links, m[1]!) ? links[m[1]!] : undefined;
    if (!base) continue;
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[0], href: base + m[0] });
    last = m.index + m[0].length;
  }
  if (!parts.length) return null;
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
