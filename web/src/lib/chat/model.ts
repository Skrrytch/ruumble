/**
 * Direct chat (ADR-0021): the conversations of the own user as this browser keeps them. The service only
 * passes messages on; the browser keeps each conversation until a day after its last text or invitation.
 * Pure functions without Svelte and without DOM; the state (chat/state.svelte.ts) stores the result.
 */
import { REACTION_KINDS, CHAT_LIMITS, type Reaction, type ReactionKind, type ChatMessage } from "@ruumble/protocol";

/** a quick reaction (A1) on a message: set by the own user, by the other one, or both */
export interface ChatReaction {
  kind: ReactionKind;
  mine: boolean;
  theirs: boolean;
}

/** a text or an invitation to a room ("come over") */
export interface ChatItem {
  id: string;
  mine: boolean;
  at: number;
  kind: "text" | "invite";
  /** the text; empty for an invitation */
  text: string;
  /** invitation: the room as the sender was in it */
  channelId: number | null;
  channelName: string;
  /** only kinds someone has set, in the order of REACTION_KINDS */
  reactions: ChatReaction[];
}

export interface Conversation {
  /** the other person's stable name (snapshot `person`) */
  person: string;
  /** their name as last seen */
  name: string;
  /** oldest first */
  items: ChatItem[];
  /** time of the last text or invitation (or of opening it): the conversation is forgotten CHAT_LIMITS.keepMs later */
  last: number;
  /** messages from the other one not seen yet */
  unread: number;
  /** shown as a tab; a closed conversation stays until it expires and opens again with the next message */
  open: boolean;
  /** when it became a tab: the order of the tabs */
  opened: number;
}

/** the other person → conversation */
export type Book = Record<string, Conversation>;

/** what a message changed: the new book, and a new text or invitation from the other one (null: none) */
export interface Received {
  book: Book;
  arrived: { conversation: Conversation; item: ChatItem } | null;
}

/**
 * Add a message from or to `me`. `seen`: the other one's conversation is in view, so it does not count as unread.
 * A message that is already there (the answer and the event of the same send) changes nothing.
 */
export function receive(book: Book, m: ChatMessage, me: string, seen: boolean, now = m.at): Received {
  const mine = m.from === me;
  if (!mine && m.to !== me) return { book, arrived: null };
  const person = mine ? m.to : m.from;
  const name = mine ? m.toName : m.fromName;
  const current = book[person];
  if (m.kind === "reaction") {
    if (!current) return { book, arrived: null };
    const items = current.items.map((i) => (i.id === m.target ? { ...i, reactions: setReaction(i.reactions, m.reaction, mine, m.on) } : i));
    return { book: { ...book, [person]: { ...current, items } }, arrived: null };
  }
  if (current?.items.some((i) => i.id === m.id)) return { book, arrived: null };
  const item: ChatItem = {
    id: m.id, mine, at: m.at, kind: m.kind, text: m.kind === "text" ? m.text : "",
    channelId: m.kind === "invite" ? m.channelId : null, channelName: m.kind === "invite" ? m.channelName : "", reactions: [],
  };
  const base = current ?? { person, name, items: [], last: m.at, unread: 0, open: true, opened: now };
  const conversation: Conversation = {
    ...base,
    name,
    items: [...base.items, item].sort((a, b) => a.at - b.at),
    last: Math.max(base.last, m.at),
    unread: !mine && !seen ? base.unread + 1 : base.unread,
    open: true,
    opened: base.open ? base.opened : now,
  };
  return { book: { ...book, [person]: conversation }, arrived: mine ? null : { conversation, item } };
}

function setReaction(reactions: ChatReaction[], kind: ReactionKind, mine: boolean, on: boolean): ChatReaction[] {
  const old = reactions.find((r) => r.kind === kind) ?? { kind, mine: false, theirs: false };
  const next = mine ? { ...old, mine: on } : { ...old, theirs: on };
  const others = reactions.filter((r) => r.kind !== kind);
  const all = next.mine || next.theirs ? [...others, next] : others;
  return all.sort((a, b) => REACTION_KINDS.indexOf(a.kind) - REACTION_KINDS.indexOf(b.kind));
}

/** open the conversation with a person as a tab (a new one if there is none), everything in it seen */
export function openConversation(book: Book, person: string, name: string, now: number): Book {
  const current = book[person];
  const conversation: Conversation = current
    ? { ...current, name, unread: 0, open: true, opened: current.open ? current.opened : now }
    : { person, name, items: [], last: now, unread: 0, open: true, opened: now };
  return { ...book, [person]: conversation };
}

/** close the tab; the conversation stays until it expires */
export function closeConversation(book: Book, person: string): Book {
  const current = book[person];
  return current ? { ...book, [person]: { ...current, open: false, unread: 0 } } : book;
}

export function markRead(book: Book, person: string): Book {
  const current = book[person];
  return current && current.unread > 0 ? { ...book, [person]: { ...current, unread: 0 } } : book;
}

/** "forget history": the conversation is gone from this browser */
export function forget(book: Book, person: string): Book {
  const { [person]: _gone, ...rest } = book;
  return rest;
}

/** without the conversations whose last text or invitation is older than a day */
export function prune(book: Book, now: number): Book {
  const keep = Object.values(book).filter((c) => now - c.last < CHAT_LIMITS.keepMs);
  return keep.length === Object.keys(book).length ? book : Object.fromEntries(keep.map((c) => [c.person, c]));
}

/** the tabs, in the order they were opened */
export function openTabs(book: Book): Conversation[] {
  return Object.values(book).filter((c) => c.open).sort((a, b) => a.opened - b.opened);
}

export function unreadTotal(book: Book): number {
  return Object.values(book).reduce((n, c) => n + (c.open ? c.unread : 0), 0);
}

/** the tab `step` places from `active` (wrapping around); the first one without an active tab */
export function adjacentTab(tabs: readonly Conversation[], active: string | null, step: number): string | null {
  if (!tabs.length) return null;
  const at = tabs.findIndex((c) => c.person === active);
  if (at < 0) return tabs[0]!.person;
  return tabs[(((at + step) % tabs.length) + tabs.length) % tabs.length]!.person;
}

/** the tab to show after `closed` was closed: the one to its right, else to its left */
export function tabAfterClose(tabs: readonly Conversation[], closed: string): string | null {
  const at = tabs.findIndex((c) => c.person === closed);
  const rest = tabs.filter((c) => c.person !== closed);
  return rest[Math.min(Math.max(at, 0), rest.length - 1)]?.person ?? null;
}

/** the reactions of a message as the reaction picker of the board shows them, with the names of who set them */
export function reactionsOf(item: ChatItem, myName: string, theirName: string): Reaction[] {
  return item.reactions.map((r) => ({
    kind: r.kind,
    count: (r.mine ? 1 : 0) + (r.theirs ? 1 : 0),
    names: [...(r.mine ? [myName] : []), ...(r.theirs ? [theirName] : [])],
    mine: r.mine,
  }));
}

/** a colour of six for a person, the same in every browser: their bubbles and the line of their tab */
export function tintOf(person: string): number {
  let h = 0;
  for (const ch of person) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 6) + 1;
}

/** where this browser keeps the conversations of `me` */
export const STORAGE_PREFIX = "ruumble.chat.";
export const storageKey = (me: string) => `${STORAGE_PREFIX}${me}`;
/** where 0.30.0 kept them, when the direct chat was still called tube mail; taken over once */
export const LEGACY_PREFIX = "ruumble.tube.";

/** read a stored book; anything that does not fit is left out */
export function parseBook(raw: string | null): Book {
  let data: unknown;
  try {
    data = JSON.parse(raw ?? "");
  } catch {
    return {};
  }
  if (!isObject(data)) return {};
  const book: Book = {};
  for (const [person, c] of Object.entries(data)) {
    if (!isObject(c) || c.person !== person || typeof c.name !== "string" || !Array.isArray(c.items)) continue;
    if (!isNumber(c.last) || !isNumber(c.unread) || !isNumber(c.opened) || typeof c.open !== "boolean") continue;
    book[person] = { person, name: c.name, items: c.items.filter(isItem), last: c.last, unread: c.unread, open: c.open, opened: c.opened };
  }
  return book;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function isItem(v: unknown): v is ChatItem {
  if (!isObject(v)) return false;
  const kindOk = v.kind === "text" || v.kind === "invite";
  const channelOk = v.channelId === null || isNumber(v.channelId);
  const reactionsOk = Array.isArray(v.reactions) && v.reactions.every((r) =>
    isObject(r) && (REACTION_KINDS as readonly unknown[]).includes(r.kind) && typeof r.mine === "boolean" && typeof r.theirs === "boolean");
  return typeof v.id === "string" && typeof v.mine === "boolean" && isNumber(v.at) && kindOk && typeof v.text === "string" && channelOk && typeof v.channelName === "string" && reactionsOk;
}
