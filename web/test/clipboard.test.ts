// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "../src/lib/board/clipboard.ts";

describe("Kopieren", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ohne sicheren Kontext (http://<LAN-IP>): Rückfall auf execCommand, Hilfsfeld wird entfernt", async () => {
    vi.stubGlobal("isSecureContext", false);
    let copied = "";
    document.execCommand = vi.fn(() => {
      copied = (document.activeElement as HTMLTextAreaElement | null)?.value ?? (document.querySelector("textarea")?.value ?? "");
      return true;
    });
    expect(await copyText("Hallo")).toBe(true);
    expect(copied).toBe("Hallo");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("mit sicherem Kontext: Clipboard-API", async () => {
    vi.stubGlobal("isSecureContext", true);
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyText("x")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("x");
  });
});
