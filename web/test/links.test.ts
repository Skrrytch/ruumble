import { describe, expect, it } from "vitest";
import { describeLink } from "../src/lib/board/links.ts";

describe("Short form of well-known URLs (A5)", () => {
  it.each([
    ["https://github.com/bespecke/ruumble/pull/13", "pr", "PR #13 · ruumble"],
    ["https://github.com/bespecke/ruumble/pull/13/files", "pr", "PR #13 · ruumble"],
    ["https://gitea.example/team/app/pulls/7", "pr", "PR #7 · app"],
    ["https://bitbucket.example/projects/P/repos/app/pull-requests/21/overview", "pr", "PR #21 · app"],
    ["https://gitlab.example/group/sub/app/-/merge_requests/42", "pr", "MR !42 · app"],
    ["https://github.com/bespecke/ruumble/issues/42", "issue", "#42 · ruumble"],
    ["https://gitlab.example/group/app/-/issues/5", "issue", "#5 · app"],
    ["https://github.com/bespecke/ruumble/commit/A1B2C3D4E5F6A7B8", "commit", "a1b2c3d · ruumble"],
    ["https://gitlab.example/group/app/-/commit/0123456789abcdef0123456789abcdef01234567", "commit", "0123456 · app"],
    ["https://bitbucket.example/projects/P/repos/app/commits/abcdef1234", "commit", "abcdef1 · app"],
    ["https://github.com/bespecke/ruumble/actions/runs/123456789012/job/1", "ci", "CI · ruumble"],
    ["https://gitlab.example/group/app/-/pipelines/98765", "ci", "Pipeline #98765 · app"],
    ["https://gitlab.example/group/app/-/jobs/111", "ci", "Job #111 · app"],
    ["https://jenkins.example/job/team/job/app%20build/123/console", "ci", "Build #123 · app build"],
    ["https://jira.example/browse/TAG-1366", "ticket", "TAG-1366"],
    ["https://example.atlassian.net/wiki/spaces/DEV/pages/123/Deployment+Guide", "page", "Deployment Guide"],
    ["https://wiki.example/display/DEV/Release_Checklist%20v2", "page", "Release Checklist v2"],
    ["https://stackoverflow.com/questions/123/how-to-exit-vim?answertab=votes", "question", "How to exit vim"],
    ["https://www.example.com/docs/setup", "other", "example.com/docs/setup"],
    ["https://example.com", "other", "example.com"],
    ["https://docs.example.com/guide/operations/advanced/networking/proxies", "other", "docs.example.com/guide/…/proxies"],
    ["https://docs.example.com/a-very-long-single-segment-name-that-goes-on", "other", "docs.example.com/a-very-long-single-seg…"],
  ])("%s", (url, kind, label) => {
    expect(describeLink(url)).toEqual({ kind, label });
  });

  it("only takes http(s) URLs", () => {
    expect(describeLink("mailto:anna@example.com")).toBeNull();
    expect(describeLink("javascript:alert(1)")).toBeNull();
    expect(describeLink("not a url")).toBeNull();
  });

  it("keeps a broken escape as it is", () => {
    expect(describeLink("https://wiki.example/display/DEV/100%")).toEqual({ kind: "page", label: "100%" });
  });

  it("does not take a number that is only part of a segment", () => {
    expect(describeLink("https://example.com/x/pull/13abc")).toEqual({ kind: "other", label: "example.com/x/pull/13abc" });
  });
});
