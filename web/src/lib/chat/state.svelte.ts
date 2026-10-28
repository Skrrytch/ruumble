/**
 * The direct chat in the web UI (ADR-0021): the conversations of the own user, the window with one tab per person, and the
 * notice when something arrives. The book lives in this browser's localStorage, per own person, and every
 * conversation is forgotten a day after its last text or invitation; nothing is kept by the service.
 */
import { CHAT_LIMITS, type ReactionKind, type ChatMessage, type ChatSend } from "@ruumble/protocol";
import type { BoardErrorCode, MumbleAdapter } from "../adapter/types.ts";
import { t } from "../i18n/index.svelte.ts";
import {
  adjacentTab, closeConversation, forget, markRead, openConversation, openTabs, parseBook, prune, receive, storageKey,
  tabAfterClose, unreadTotal, LEGACY_PREFIX, STORAGE_PREFIX, type Book, type ChatItem,
} from "./model.ts";

export type ChatPanel = "closed" | "open";

/** the notice of a new message while its conversation is not in view */
export interface ChatToast {
  person: string;
  name: string;
  text: string;
}

const TOAST_MS = 8000;
const PRUNE_EVERY_MS = 60_000;

/** what the direct chat needs from the rest of the web UI */
export interface ChatHost {
  notice(text: string): void;
  /** a message from someone else arrived; `seen` when its conversation is in view */
  arrived(name: string, seen: boolean, text: string): void;
}

/** plain text for a message that did not go out */
export function chatErrorText(error: BoardErrorCode, name: string): string {
  const m = t().chat.errors;
  return error === "rate-limited" ? m.rateLimited
    : error === "not-found" ? m.unreachable(name)
    : error === "invalid" ? m.invalid
    : error === "not-paired" ? t().common.mumbleOffline
    : error === "offline" ? t().boardErrors.offline
    : t().notices.actionFailed;
}

export class ChatState {
  book = $state<Book>({});
  panel = $state<ChatPanel>("closed");
  /** the other person of the tab in view */
  active = $state<string | null>(null);
  toast = $state<ChatToast | null>(null);
  /** unsent text per person, while the page is open */
  drafts = $state<Record<string, string>>({});
  /** a message is on its way */
  busy = $state(false);
  /** the own person (snapshot `person`); null until known */
  me = $state<string | null>(null);
  /**
   * where the window puts the focus, asked anew with every tick: the text field when one turns to a person (to
   * write), the tab when one moves with the keyboard (P, comma, full stop), so the next shortcut still works
   */
  focus = $state<{ target: "composer" | "tab"; tick: number }>({ target: "composer", tick: 0 });

  tabs = $derived(openTabs(this.book));
  unread = $derived(unreadTotal(this.book));
  conversation = $derived(this.active ? (this.book[this.active] ?? null) : null);

  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly adapter: MumbleAdapter,
    private readonly host: ChatHost,
  ) {}

  start(): void {
    this.pruneTimer = setInterval(() => this.update(prune(this.book, Date.now())), PRUNE_EVERY_MS);
    // another tab of this browser wrote the book: take it over
    const onStorage = (e: StorageEvent) => {
      if (this.me && e.key === storageKey(this.me)) this.book = prune(parseBook(e.newValue), Date.now());
    };
    // back in a hidden tab: the conversation in view counts as read
    const onVisible = () => {
      if (!document.hidden && this.panel === "open" && this.active) this.update(markRead(this.book, this.active));
    };
    addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    this.cleanup.push(() => removeEventListener("storage", onStorage), () => document.removeEventListener("visibilitychange", onVisible));
  }

  stop(): void {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    for (const fn of this.cleanup.splice(0)) fn();
  }

  /** the own person from the snapshot; another one (or the first) loads their book */
  identify(me: string | null): void {
    if (!me || me === this.me) return;
    this.me = me;
    this.book = prune(parseBook(read(storageKey(me)) ?? takeLegacy(me)), Date.now());
    this.active = this.tabs[0]?.person ?? null;
    this.save();
  }

  /** this browser is no longer paired: every conversation is forgotten here */
  forgetAll(): void {
    this.book = {};
    this.active = null;
    this.panel = "closed";
    this.toast = null;
    this.drafts = {};
    this.me = null;
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith(STORAGE_PREFIX) || key.startsWith(LEGACY_PREFIX)) localStorage.removeItem(key);
    } catch {
      /* no storage: nothing kept */
    }
  }

  /** a message from the service (event or answer); a new one from someone else shows a notice unless it is in view */
  receive(m: ChatMessage): void {
    if (!this.me) return;
    const person = m.from === this.me ? m.to : m.from;
    const seen = this.inView(person);
    const r = receive(this.book, m, this.me, seen, Date.now());
    this.update(r.book);
    if (this.active === null || !this.book[this.active]?.open) this.active = person;
    if (r.arrived) {
      const { conversation, item } = r.arrived;
      const text = item.kind === "text" ? item.text : t().chat.inviteFrom(item.channelName);
      this.host.arrived(conversation.name, seen, text);
      if (!seen) this.showToast({ person, name: conversation.name, text });
    }
  }

  /** open the conversation with a person (person card, directory, notice) */
  open(person: string, name: string): void {
    this.update(openConversation(this.book, person, name, Date.now()));
    this.active = person;
    this.panel = "open";
    if (this.toast?.person === person) this.dismissToast();
    this.focusOn("composer");
  }

  /** a tab clicked: ready to write there */
  select(person: string): void {
    this.show(person);
    this.focusOn("composer");
  }

  /** the tab `step` places further (shortcuts , and ., arrow keys on the tabs) */
  cycle(step: number): void {
    const next = adjacentTab(this.tabs, this.active, step);
    if (!next) return;
    this.show(next);
    this.focusOn("tab");
  }

  close(person: string): void {
    const next = tabAfterClose(this.tabs, person);
    this.update(closeConversation(this.book, person));
    if (this.active === person) this.active = next;
    if (!this.tabs.length) this.panel = "closed";
  }

  /** "forget history": gone from this browser, the tab too */
  forget(person: string): void {
    const next = tabAfterClose(this.tabs, person);
    this.update(forget(this.book, person));
    if (this.active === person) this.active = next;
    const { [person]: _draft, ...drafts } = this.drafts;
    this.drafts = drafts;
  }

  /** P: open the window (on the last tab) or close it */
  toggle(): void {
    if (this.panel === "open") this.panel = "closed";
    else this.reopen();
  }

  /** open again where one left off: the last tab in view, else the first */
  private reopen(): void {
    this.panel = "open";
    if (!this.active || !this.book[this.active]?.open) this.active = this.tabs[0]?.person ?? null;
    if (this.active) this.update(markRead(this.book, this.active));
    this.focusOn("tab");
  }

  closePanel(): void {
    this.panel = "closed";
  }

  setDraft(person: string, text: string): void {
    this.drafts = { ...this.drafts, [person]: text };
  }

  /** send the draft to the person in view; true once it went out */
  async sendText(): Promise<boolean> {
    const person = this.active;
    const text = person ? (this.drafts[person] ?? "").trim() : "";
    if (!person || !text) return false;
    if (text.length > CHAT_LIMITS.textChars) {
      this.host.notice(t().chat.errors.invalid);
      return false;
    }
    const ok = await this.send({ kind: "text", to: person, text });
    if (ok) this.setDraft(person, "");
    return ok;
  }

  /** "come over": an invitation to the own room */
  invite(): Promise<boolean> {
    return this.active ? this.send({ kind: "invite", to: this.active }) : Promise.resolve(false);
  }

  /** set or take back the own quick reaction on a message */
  react(item: ChatItem, kind: ReactionKind): Promise<boolean> {
    if (!this.active) return Promise.resolve(false);
    const on = !item.reactions.some((r) => r.kind === kind && r.mine);
    return this.send({ kind: "reaction", to: this.active, target: item.id, reaction: kind, on });
  }

  dismissToast(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast = null;
  }

  private async send(message: ChatSend): Promise<boolean> {
    this.busy = true;
    const r = await this.adapter.chat.send(message);
    this.busy = false;
    if (r.ok) {
      this.receive(r.value);
      return true;
    }
    this.host.notice(chatErrorText(r.error, this.book[message.to]?.name ?? ""));
    return false;
  }

  private show(person: string): void {
    this.active = person;
    this.update(markRead(this.book, person));
  }

  private focusOn(target: "composer" | "tab"): void {
    this.focus = { target, tick: this.focus.tick + 1 };
  }

  private inView(person: string): boolean {
    return this.panel === "open" && this.active === person && !document.hidden;
  }

  private showToast(toast: ChatToast): void {
    this.toast = toast;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), TOAST_MS);
  }

  private update(book: Book): void {
    if (book === this.book) return;
    this.book = book;
    this.save();
  }

  private save(): void {
    if (!this.me) return;
    try {
      const key = storageKey(this.me);
      if (Object.keys(this.book).length) localStorage.setItem(key, JSON.stringify(this.book));
      else localStorage.removeItem(key);
    } catch {
      /* private mode or full: kept until the page is closed */
    }
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** the book as 0.30.0 kept it (tube mail); removed there, saved under the new key by the caller */
function takeLegacy(me: string): string | null {
  const raw = read(`${LEGACY_PREFIX}${me}`);
  try {
    localStorage.removeItem(`${LEGACY_PREFIX}${me}`);
  } catch {
    /* no storage */
  }
  return raw;
}
