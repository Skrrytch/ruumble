import { describe, expect, it } from "vitest";
import { parseTaskList, setTask } from "../src/index.ts";

describe("task lists (A2)", () => {
  it("introduction in Markdown, then only task lines; markers with and without list sign", () => {
    const list = parseTaskList("## Release 1.4\nBefore Friday:\n\n- [ ] Tag the release\n* [x] Changelog\n\n[X] Deploy\n+ [ ]   Announce  ");
    expect(list?.intro).toBe("## Release 1.4\nBefore Friday:");
    expect(list?.tasks).toEqual([
      { index: 0, line: 3, done: false, text: "Tag the release" },
      { index: 1, line: 4, done: true, text: "Changelog" },
      { index: 2, line: 6, done: true, text: "Deploy" },
      { index: 3, line: 7, done: false, text: "Announce" },
    ]);
    expect(parseTaskList("[ ] only a task")).toEqual({ intro: "", tasks: [{ index: 0, line: 0, done: false, text: "only a task" }] });
    // empty brackets count as open
    expect(parseTaskList("[] one\n- [] two\n* [x] three")?.tasks.map((t) => [t.text, t.done])).toEqual([["one", false], ["two", false], ["three", true]]);
  });

  it("strict: anything after the first task, a task without text or an open code block → no task list", () => {
    expect(parseTaskList("just text")).toBeNull();
    expect(parseTaskList("- [ ] one\nand then a paragraph")).toBeNull();
    expect(parseTaskList("- [ ] one\n```\ncode\n```")).toBeNull();
    expect(parseTaskList("- [ ] one\n- normal item")).toBeNull();
    expect(parseTaskList("- [ ]\n- [x] two")).toBeNull(); // "- [ ]" without text is no task
    expect(parseTaskList("- []\n- [x] two")).toBeNull();
    expect(parseTaskList("```\n- [ ] inside code")).toBeNull();
    expect(parseTaskList("```\nclosed\n```\n- [ ] after code")?.tasks).toHaveLength(1);
    expect(parseTaskList("[y] no marker")).toBeNull();
  });

  it("ticking changes only the marker of that line, keeps everything else (also CRLF)", () => {
    const text = "Intro\r\n\r\n- [ ] a\r\n  * [X] b";
    expect(setTask(text, 0, true)).toBe("Intro\r\n\r\n- [x] a\r\n  * [X] b");
    expect(setTask(text, 1, false)).toBe("Intro\r\n\r\n- [ ] a\r\n  * [ ] b");
    expect(setTask("- [ ] [ ] brackets in the text", 0, true)).toBe("- [x] [ ] brackets in the text");
    expect(setTask("- [] empty", 0, true)).toBe("- [x] empty");
    expect(setTask("- [] empty", 0, false)).toBe("- [ ] empty"); // untick normalises the marker
    expect(setTask(text, 2, true)).toBeNull();
    expect(setTask("no tasks", 0, true)).toBeNull();
  });
});
