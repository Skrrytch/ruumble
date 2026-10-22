// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { CHAT_LIMITS, type ChatMessage, type ChatSend } from "@ruumble/protocol";
import type { MumbleAdapter } from "../src/lib/adapter/types.ts";
import {
  adjacentTab, closeConversation, forget, markRead, openConversation, openTabs, parseBook, prune, reactionsOf, receive, storageKey, tabAfterClose,
  tintOf, unreadTotal, type Book,
} from "../src/lib/chat/model.ts";
import { ChatState, chatErrorText } from "../src/lib/chat/state.svelte.ts";

const ME = "0000000000000001", ANNA = "00000000000000aa", BEN = "00000000000000bb";
const DAY = CHAT_LIMITS.keepMs;

let seq = 0;
function text(from: string, to: string, at: number, body = "hi"): ChatMessage {
  return { id: `m${++seq}`, from, to, fromName: from === ME ? "Me" : from === ANNA ? "Anna" : "Ben", toName: to === ME ? "Me" : to === ANNA ? "Anna" : "Ben", at, kind: "text", text: body };
}

describe("direct chat: the conversations of the own user (ADR-0021)", () => {
  it("a message from someone starts their conversation as a tab and counts as unread unless it is in view", () => {
    const m = text(ANNA, ME, 1000, "Got a minute?");
    const r = receive({}, m, ME, false);
    expect(r.book[ANNA]).toMatchObject({ person: ANNA, name: "Anna", last: 1000, unread: 1, open: true, opened: 1000 });
    expect(r.book[ANNA]!.items).toEqual([{ id: m.id, mine: false, at: 1000, kind: "text", text: "Got a minute?", channelId: null, channelName: "", reactions: [] }]);
    expect(r.arrived?.item.text).toBe("Got a minute?");
    expect(receive({}, m, ME, true).book[ANNA]!.unread).toBe(0);
  });

  it("own messages go to the other one's conversation, are never unread and bring no notice; the same message twice changes nothing", () => {
    const m = text(ME, BEN, 2000);
    const r = receive({}, m, ME, false);
    expect(r.book[BEN]).toMatchObject({ name: "Ben", unread: 0 });
    expect(r.book[BEN]!.items[0]!.mine).toBe(true);
    expect(r.arrived).toBeNull();
    expect(receive(r.book, m, ME, false).book).toBe(r.book);
    expect(receive(r.book, text(ANNA, BEN, 3000), ME, false).book).toBe(r.book); // not for me
  });

  it("an invitation keeps the room; messages stay in time order and the last one sets the expiry", () => {
    const invite: ChatMessage = { id: "inv", from: ANNA, to: ME, fromName: "Anna", toName: "Me", at: 5000, kind: "invite", channelId: 3, channelName: "Kitchen" };
    let book = receive({}, invite, ME, false).book;
    book = receive(book, text(ME, ANNA, 4000), ME, false).book;
    expect(book[ANNA]!.items.map((i) => i.at)).toEqual([4000, 5000]);
    expect(book[ANNA]!.items[1]).toMatchObject({ kind: "invite", text: "", channelId: 3, channelName: "Kitchen" });
    expect(book[ANNA]!.last).toBe(5000);
  });

  it("reactions: set and taken back by either side, in the order of the reactions, shown with names", () => {
    const m = text(ANNA, ME, 1000);
    let book = receive({}, m, ME, true).book;
    const react = (from: string, reaction: "agree" | "idea", on: boolean): ChatMessage =>
      ({ id: `r${++seq}`, from, to: from === ME ? ANNA : ME, fromName: "", toName: "", at: 2000, kind: "reaction", target: m.id, reaction, on });
    book = receive(book, react(ME, "idea", true), ME, false).book;
    book = receive(book, react(ANNA, "agree", true), ME, false).book;
    book = receive(book, react(ME, "agree", true), ME, false).book;
    const item = book[ANNA]!.items[0]!;
    expect(item.reactions).toEqual([{ kind: "agree", mine: true, theirs: true }, { kind: "idea", mine: true, theirs: false }]);
    expect(reactionsOf(item, "Me", "Anna")).toEqual([
      { kind: "agree", count: 2, names: ["Me", "Anna"], mine: true },
      { kind: "idea", count: 1, names: ["Me"], mine: true },
    ]);
    expect(book[ANNA]!.unread).toBe(0); // a reaction is not a message
    expect(book[ANNA]!.last).toBe(1000); // nor does it keep the conversation longer
    book = receive(book, react(ME, "idea", false), ME, false).book;
    expect(book[ANNA]!.items[0]!.reactions.map((r) => r.kind)).toEqual(["agree"]);
    expect(receive({}, react(ANNA, "agree", true), ME, false).book).toEqual({}); // unknown conversation
  });

  it("tabs: opened, closed (kept until it expires) and opened again by the next message", () => {
    let book = openConversation({}, ANNA, "Anna", 100);
    expect(book[ANNA]).toMatchObject({ items: [], last: 100, open: true, opened: 100 });
    book = openConversation(book, BEN, "Ben", 200);
    expect(openTabs(book).map((c) => c.person)).toEqual([ANNA, BEN]);
    book = closeConversation(book, ANNA);
    expect(openTabs(book).map((c) => c.person)).toEqual([BEN]);
    expect(book[ANNA]).toBeDefined();
    book = receive(book, text(ANNA, ME, 300), ME, false, 300).book;
    expect(openTabs(book).map((c) => c.person)).toEqual([BEN, ANNA]); // opened again: now the last tab
    expect(openConversation(book, ANNA, "Anna B.", 400)[ANNA]).toMatchObject({ name: "Anna B.", unread: 0, opened: 300 });
    expect(closeConversation(book, "missing")).toBe(book);
  });

  it("unread: per conversation and in total (closed tabs do not count), read again", () => {
    let book = receive({}, text(ANNA, ME, 1), ME, false).book;
    book = receive(book, text(ANNA, ME, 2), ME, false).book;
    book = receive(book, text(BEN, ME, 3), ME, false).book;
    expect(unreadTotal(book)).toBe(3);
    book = markRead(book, ANNA);
    expect(unreadTotal(book)).toBe(1);
    expect(markRead(book, ANNA)).toBe(book);
    expect(unreadTotal(closeConversation(book, BEN))).toBe(0);
  });

  it("forgotten a day after the last text or invitation; forget at once", () => {
    let book = receive({}, text(ANNA, ME, 0), ME, true).book;
    book = receive(book, text(BEN, ME, 10 * 3600_000), ME, true).book;
    expect(prune(book, DAY - 1)).toBe(book);
    expect(Object.keys(prune(book, DAY))).toEqual([BEN]);
    expect(prune(book, DAY + 10 * 3600_000)).toEqual({});
    expect(Object.keys(forget(book, ANNA))).toEqual([BEN]);
  });

  it("moving between tabs wraps around; after closing, the neighbour on the right, else on the left", () => {
    const book: Book = [ANNA, BEN, ME].reduce<Book>((b, p, i) => openConversation(b, p, p, i), {});
    const tabs = openTabs(book);
    expect(adjacentTab(tabs, ANNA, 1)).toBe(BEN);
    expect(adjacentTab(tabs, ANNA, -1)).toBe(ME);
    expect(adjacentTab(tabs, ME, 1)).toBe(ANNA);
    expect(adjacentTab(tabs, null, 1)).toBe(ANNA);
    expect(adjacentTab([], ANNA, 1)).toBeNull();
    expect(tabAfterClose(tabs, BEN)).toBe(ME);
    expect(tabAfterClose(tabs, ME)).toBe(BEN);
    expect(tabAfterClose(tabs.slice(0, 1), ANNA)).toBeNull();
  });

  it("a colour of six per person, the same every time", () => {
    const tints = ["a1b2c3d4e5f60718", "0f1e2d3c4b5a6978", ANNA, BEN, ME].map(tintOf);
    for (const tint of tints) expect(tint).toBeGreaterThanOrEqual(1), expect(tint).toBeLessThanOrEqual(6);
    expect(tintOf(ANNA)).toBe(tintOf(ANNA));
    expect(new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(tintOf)).size).toBeGreaterThan(3);
  });

  it("stored and read back; anything broken is left out", () => {
    let book = receive({}, text(ANNA, ME, 1000), ME, false).book;
    book = receive(book, { id: "inv", from: ME, to: ANNA, fromName: "Me", toName: "Anna", at: 2000, kind: "invite", channelId: 3, channelName: "Kitchen" }, ME, false).book;
    expect(parseBook(JSON.stringify(book))).toEqual(book);
    expect(parseBook(null)).toEqual({});
    expect(parseBook("{broken")).toEqual({});
    expect(parseBook("[1]")).toEqual({});
    const broken = {
      a: { person: "b", name: "x", items: [], last: 1, unread: 0, open: true, opened: 1 },
      b: { person: "b", name: 3, items: [], last: 1, unread: 0, open: true, opened: 1 },
      c: { person: "c", name: "x", items: [], last: "1", unread: 0, open: true, opened: 1 },
      d: { person: "d", name: "x", items: [{ id: "1" }, null, { id: "2", mine: true, at: 1, kind: "text", text: "ok", channelId: null, channelName: "", reactions: [{ kind: "nope", mine: true, theirs: false }] }], last: 1, unread: 0, open: true, opened: 1 },
    };
    expect(parseBook(JSON.stringify(broken))).toEqual({ d: { ...broken.d, items: [] } });
    expect(storageKey(ME)).toBe(`ruumble.chat.${ME}`);
  });
});

describe("direct chat in the web UI (state)", () => {
  /** a service that answers every send with the message, from ME */
  function setup(fail: Parameters<typeof chatErrorText>[0] | null = null) {
    const sent: ChatSend[] = [];
    const notices: string[] = [];
    const adapter = {
      chat: {
        send: async (s: ChatSend) => {
          sent.push(s);
          if (fail) return { ok: false as const, error: fail };
          const head = { id: `s${++seq}`, from: ME, to: s.to, fromName: "Me", toName: "Anna", at: Date.now() };
          const message: ChatMessage = s.kind === "text" ? { ...head, kind: "text", text: s.text }
            : s.kind === "invite" ? { ...head, kind: "invite", channelId: 1, channelName: "Lobby" }
            : { ...head, kind: "reaction", target: s.target, reaction: s.reaction, on: s.on };
          return { ok: true as const, value: message };
        },
      },
    } as unknown as MumbleAdapter;
    const chat = new ChatState(adapter, { notice: (t) => notices.push(t) });
    chat.identify(ME);
    return { chat, sent, notices };
  }

  beforeEach(() => localStorage.clear());

  it("something arrives: a notice, unread, kept in this browser per own person", () => {
    const { chat } = setup();
    chat.receive(text(ANNA, ME, Date.now(), "Got a minute?"));
    expect(chat.toast).toEqual({ person: ANNA, name: "Anna", text: "Got a minute?" });
    expect(chat.unread).toBe(1);
    expect(chat.active).toBe(ANNA);
    expect(parseBook(localStorage.getItem(storageKey(ME)))[ANNA]!.items).toHaveLength(1);
    const again = setup().chat;
    expect(again.tabs.map((c) => c.person)).toEqual([ANNA]);
    again.forgetAll();
    expect(localStorage.length).toBe(0);
    expect(again.tabs).toEqual([]);
  });

  it("takes over the conversations kept under the old name (tube mail, 0.30.0) once", () => {
    const { chat } = setup();
    chat.receive(text(ANNA, ME, Date.now(), "Got a minute?"));
    const kept = localStorage.getItem(storageKey(ME))!;
    localStorage.clear();
    localStorage.setItem(`ruumble.tube.${ME}`, kept);
    const again = setup().chat;
    expect(again.tabs.map((c) => c.person)).toEqual([ANNA]);
    expect(localStorage.getItem(`ruumble.tube.${ME}`)).toBeNull();
    expect(localStorage.getItem(storageKey(ME))).not.toBeNull();
  });

  it("open, write, invite, react; what is in view is read and brings no notice", async () => {
    const { chat, sent } = setup();
    chat.open(ANNA, "Anna");
    expect(chat.panel).toBe("open");
    chat.setDraft(ANNA, "  Hello  ");
    expect(await chat.sendText()).toBe(true);
    expect(sent[0]).toEqual({ kind: "text", to: ANNA, text: "Hello" });
    expect(chat.drafts[ANNA]).toBe("");
    expect(await chat.sendText()).toBe(false); // nothing to send
    await chat.invite();
    expect(sent[1]).toEqual({ kind: "invite", to: ANNA });
    chat.receive(text(ANNA, ME, Date.now()));
    expect(chat.toast).toBeNull();
    expect(chat.unread).toBe(0);
    const item = chat.conversation!.items.at(-1)!;
    await chat.react(item, "agree");
    expect(sent[2]).toMatchObject({ kind: "reaction", target: item.id, reaction: "agree", on: true });
    expect(chat.conversation!.items.at(-1)!.reactions).toEqual([{ kind: "agree", mine: true, theirs: false }]);
    await chat.react(chat.conversation!.items.at(-1)!, "agree");
    expect(sent[3]).toMatchObject({ on: false });
  });

  it("the window: toggle, tabs, close and forget", () => {
    const { chat } = setup();
    chat.toggle();
    expect(chat.panel).toBe("open");
    chat.toggle();
    expect(chat.panel).toBe("closed");
    chat.open(ANNA, "Anna");
    chat.open(BEN, "Ben");
    expect(chat.active).toBe(BEN);
    chat.cycle(1);
    expect(chat.active).toBe(ANNA);
    chat.toggle();
    chat.toggle();
    expect(chat.panel).toBe("open");
    expect(chat.active).toBe(ANNA); // where one left off
    chat.close(ANNA);
    expect(chat.active).toBe(BEN);
    chat.forget(BEN);
    expect(chat.active).toBeNull();
    expect(chat.tabs).toEqual([]);
    chat.open(ANNA, "Anna");
    chat.close(ANNA);
    expect(chat.panel).toBe("closed");
  });

  it("what did not go out: a notice in words, the draft stays", async () => {
    const { chat, notices } = setup("rate-limited");
    chat.open(ANNA, "Anna");
    chat.setDraft(ANNA, "Hello");
    expect(await chat.sendText()).toBe(false);
    expect(chat.drafts[ANNA]).toBe("Hello");
    expect(notices).toEqual(["Too many messages in a short time – please wait a moment."]);
    chat.setDraft(ANNA, "x".repeat(CHAT_LIMITS.textChars + 1));
    expect(await chat.sendText()).toBe(false);
    expect(notices[1]).toBe("The message is empty or too long.");
    expect(["not-found", "invalid", "not-paired", "offline", "forbidden"].map((e) => chatErrorText(e as "invalid", "Anna"))).toEqual([
      "Anna cannot be reached right now.", "The message is empty or too long.", "Mumble is not connected.", "No connection to the Ruumble service.", "Action not possible.",
    ]);
  });
});
