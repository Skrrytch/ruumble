import { describe, expect, it } from "vitest";
import { BoardView, learnTicketLinks, splitTickets, ticketProjects } from "../src/index.ts";

describe("ticket keys (learned links)", () => {
  it("learns the base of /browse/ links, the first per project wins", () => {
    const text = [
      "see https://jira.example.com/browse/TAG-1366 and https://jira.example.com/jira/browse/VKB-7?focusedCommentId=1",
      "moved: https://other.example/browse/TAG-12",
      "[markdown](https://jira.example.com/browse/ABC2-5)",
    ].join("\n");
    expect(learnTicketLinks(text)).toEqual({
      TAG: "https://jira.example.com/browse/",
      VKB: "https://jira.example.com/jira/browse/",
      ABC2: "https://jira.example.com/browse/",
    });
    // an earlier post wins
    expect(learnTicketLinks("https://evil.example/browse/TAG-1", { TAG: "https://jira.example.com/browse/" }).TAG).toBe("https://jira.example.com/browse/");
  });

  it("ignores what is not an issue link", () => {
    expect(learnTicketLinks("https://x.example/?u=https://y.example/browse/TAG-1")).toEqual({ TAG: "https://y.example/browse/" });
    expect(learnTicketLinks("https://x.example/redirect?to=/browse/TAG-1")).toEqual({});
    expect(learnTicketLinks("https://x.example/browse/tag-1 https://x.example/browse/TAG-0 https://x.example/browse/T-1 ftp://x/browse/TAG-1")).toEqual({});
    expect(learnTicketLinks("https://x.example/browse/TAG-1-2")).toEqual({});
  });

  it("finds plain keys, not inside words, paths or versions", () => {
    expect([...ticketProjects("TAG-1366 is done, (VKB-7), see ABC-1.")]).toEqual(["TAG", "VKB", "ABC"]);
    expect([...ticketProjects("/browse/TAG-1 x.TAG-1 aTAG-1 TAG-1-2 TAG-1.2 TAG-0 T-1 tag-1")]).toEqual([]);
  });

  it("splits a text at keys of known projects only", () => {
    const links = { TAG: "https://jira.example.com/browse/" };
    expect(splitTickets("Fixed TAG-1366 and UTF-8, not SHA-256.", links)).toEqual([
      { text: "Fixed " },
      { text: "TAG-1366", href: "https://jira.example.com/browse/TAG-1366" },
      { text: " and UTF-8, not SHA-256." },
    ]);
    expect(splitTickets("TAG-1", links)).toEqual([{ text: "TAG-1", href: "https://jira.example.com/browse/TAG-1" }]);
    expect(splitTickets("UTF-8 and constructor-1", { ...links, constructor: "x" })).toBeNull();
    expect(splitTickets("no keys", links)).toBeNull();
  });

  it("the board view accepts only http(s) bases", () => {
    const view = { channelId: 1, channelName: "Room", posts: [], pinned: null };
    expect(BoardView.safeParse({ ...view, tickets: { TAG: "https://jira.example.com/browse/" } }).success).toBe(true);
    expect(BoardView.safeParse({ ...view, tickets: { TAG: "javascript:alert(1)//" } }).success).toBe(false);
    expect(BoardView.safeParse(view).success).toBe(true);
  });
});
