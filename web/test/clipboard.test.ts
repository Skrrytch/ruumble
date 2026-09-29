// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "../src/lib/board/clipboard.ts";

describe("Copying", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("without a secure context (http://<LAN-IP>): falls back to execCommand, helper field is removed", async () => {
    vi.stubGlobal("isSecureContext", false);
    let copied = "";
    document.execCommand = vi.fn(() => {
      copied = (document.activeElement as HTMLTextAreaElement | null)?.value ?? (document.querySelector("textarea")?.value ?? "");
      return true;
    });
    expect(await copyText("Hello")).toBe(true);
    expect(copied).toBe("Hello");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("with a secure context: Clipboard API", async () => {
    vi.stubGlobal("isSecureContext", true);
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyText("x")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("x");
  });
});
