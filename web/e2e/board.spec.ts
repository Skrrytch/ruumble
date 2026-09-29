import { expect, test } from "@playwright/test";

test.describe("Board (AP11.2)", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=sample&talking=0"));

  test("hidden at first, the note in the user's own room shows and hides it", async ({ page }) => {
    await expect(page.getByRole("complementary", { name: "Board" })).toHaveCount(0);
    const toggle = page.getByRole("button", { name: "Show board" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    const board = page.getByRole("complementary", { name: "Board" });
    await expect(board.getByRole("heading", { name: "Board" })).toBeVisible();
    await expect(board.getByText("4 posts")).toBeVisible();
    await page.getByRole("button", { name: "Hide board" }).first().click();
    await expect(board).toHaveCount(0);
  });

  test("other rooms show no notes, even when something is pinned there", async ({ page }) => {
    await expect(page.locator('.wrap:has(.room[data-channel="7"]) .notes')).toHaveCount(0); // Clara, with posts
    await expect(page.locator("svg.notes")).toHaveCount(1); // only the toggle in the user's own room
  });

  test("cards: code highlighted, long texts truncated, popup shows everything and saves changes", async ({ page }) => {
    await page.getByRole("button", { name: "Show board" }).click();
    const board = page.getByRole("complementary", { name: "Board" });
    await expect(board.locator(".hljs-keyword").first()).toBeVisible();
    const notes = board.getByRole("article", { name: "Post by Anna" });
    await expect(notes.locator(".body.clamped")).toHaveCount(1);
    await expect(notes.getByText("last edited by Ben")).toBeVisible();
    await notes.getByRole("button", { name: "Open · edit" }).click();
    const dialog = page.getByRole("dialog", { name: "Post by Anna" });
    await expect(dialog.getByText("Tag the release")).toBeVisible();
    await dialog.getByRole("button", { name: "Edit" }).click();
    await dialog.getByRole("textbox", { name: "Edit post" }).fill("New **bold**");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.locator("strong", { hasText: "bold" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(notes.getByText("last edited by Anna")).toBeVisible();
  });

  test("code: preview without line numbers, popup with them", async ({ page }) => {
    await page.getByRole("button", { name: "Show board" }).click();
    const code = page.getByRole("complementary", { name: "Board" }).getByRole("article", { name: "Post by Ben" }).filter({ has: page.locator(".hljs") });
    await expect(code.locator(".hljs")).toBeVisible();
    await expect(code.locator(".gutter")).toHaveCount(0);
    await code.getByRole("button", { name: "Open · edit" }).click();
    await expect(page.getByRole("dialog").locator(".gutter")).toBeVisible();
  });

  test("pin with Ctrl+Enter, filter, delete", async ({ page }) => {
    await page.getByRole("button", { name: "Show board" }).click();
    const board = page.getByRole("complementary", { name: "Board" });
    const input = board.getByRole("textbox", { name: "New post" });
    await input.fill("Quick **note**");
    await input.press("Control+Enter");
    await expect(board.getByText("5 posts")).toBeVisible();
    await expect(board.getByRole("article").first().locator("strong", { hasText: "note" })).toBeVisible();
    await expect(input).toHaveValue("");
    await board.getByRole("button", { name: "Code", exact: true }).click();
    await expect(board.getByRole("article")).toHaveCount(1);
    await board.getByRole("button", { name: "All" }).click();
    // delete own post
    page.once("dialog", (d) => d.accept());
    await board.getByRole("article").first().getByRole("button", { name: "Open · edit" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(board.getByText("4 posts")).toBeVisible();
  });

  test("pasted code: suggestion “pin as code”", async ({ page }) => {
    await page.getByRole("button", { name: "Show board" }).click();
    const input = page.getByRole("textbox", { name: "New post" });
    await input.focus();
    await input.evaluate((el) => {
      const data = new DataTransfer();
      data.setData("text/plain", "function f(a) {\n  return a + 1;\n}");
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
    });
    await page.getByRole("status").getByRole("button", { name: "Yes" }).click();
    await expect(page.getByRole("button", { name: "Pin as code" })).toHaveAttribute("aria-pressed", "true");
  });

  test("HTML in a post stays text", async ({ page }) => {
    await page.getByRole("button", { name: "Show board" }).click();
    const board = page.getByRole("complementary", { name: "Board" });
    await board.getByRole("textbox", { name: "New post" }).fill('<img src=x onerror="document.title=\'hacked\'"> [x](javascript:alert(1))');
    await board.getByRole("button", { name: "Send" }).click();
    await expect(board.getByRole("article").first()).toContainText("<img src=x");
    await expect(board.getByRole("article").first().locator("img")).toHaveCount(0);
    expect(await page.title()).toBe("Ruumble");
  });

  test("in the corridor: notice instead of the board", async ({ page }) => {
    await page.getByRole("button", { name: "Show board" }).click();
    await page.getByRole("button", { name: "Corridor Development – enter" }).click();
    await expect(page.getByText("Boards exist only in rooms.")).toBeVisible();
  });
});

test("floor with 2 rooms: one room at the top and one at the bottom, the open board gets wider", async ({ page }) => {
  await page.goto("/?fixture=edge-cases&talking=0");
  await page.getByRole("button", { name: /STUDIO/ }).click();
  await page.getByRole("button", { name: "Studio A – enter" }).click();
  const a = page.locator('.room[data-channel="41"]');
  const b = page.locator('.room[data-channel="42"]');
  expect((await b.boundingBox())!.y).toBeGreaterThan((await a.boundingBox())!.y + 200);
  await page.getByRole("button", { name: "Show board" }).click();
  const board = page.getByRole("complementary", { name: "Board" });
  await expect(board).toBeVisible();
  expect((await board.boundingBox())!.width).toBeGreaterThan(450);
});

test.describe("Board: images and files (AP11.3)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?fixture=sample&talking=0");
    await page.getByRole("button", { name: "Show board" }).click();
  });

  test("paper clip: upload a file, pin it with a description, download link", async ({ page }) => {
    const board = page.getByRole("complementary", { name: "Board" });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), board.getByRole("button", { name: "Attach image or file" }).click()]);
    await chooser.setFiles({ name: "report.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
    await expect(board.getByText("13 B · ready")).toBeVisible();
    await expect(board.getByRole("button", { name: "Pin as code" })).toBeDisabled();
    await board.getByRole("textbox", { name: "New post" }).fill("For **reading**");
    await board.getByRole("button", { name: "Send" }).click();
    const card = board.getByRole("article").first();
    await expect(card.getByText("report.pdf")).toBeVisible();
    await expect(card.locator("strong", { hasText: "reading" })).toBeVisible();
    await expect(card.getByRole("link", { name: /report\.pdf/ })).toHaveAttribute("download", "report.pdf");
    await expect(board.getByText("5 posts")).toBeVisible();
    await board.getByRole("button", { name: "Files" }).click();
    await expect(board.getByRole("article")).toHaveCount(2);
  });

  test("paste an image (Ctrl+V), full screen with zoom, Esc closes", async ({ page }) => {
    const input = page.getByRole("textbox", { name: "New post" });
    await input.evaluate(async (el) => {
      const c = document.createElement("canvas");
      c.width = 400;
      c.height = 200;
      c.getContext("2d")!.fillRect(0, 0, 200, 100);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
      const data = new DataTransfer();
      data.items.add(new File([blob], "image.png", { type: "image/png" }));
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    const board = page.getByRole("complementary", { name: "Board" });
    await expect(board.getByText(/^image-\d{4}-\d{2}-\d{2}-\d{4}\.png$/)).toBeVisible();
    await expect(board.getByText(/· ready$/)).toBeVisible();
    await input.press("Control+Enter");
    const card = board.getByRole("article").first();
    await expect(card.getByText("Image", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: /full size/ }).click();
    const lightbox = page.getByRole("dialog", { name: /^Image: image-/ });
    await expect(lightbox.getByText("100 %")).toBeVisible();
    await lightbox.getByRole("button", { name: "Zoom in" }).click();
    await expect(lightbox.getByText("125 %")).toBeVisible();
    await lightbox.getByRole("button", { name: "Fit" }).click();
    await expect(lightbox.getByText("100 %")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(lightbox).toHaveCount(0);
  });

  test("drag a file onto the board", async ({ page }) => {
    const board = page.getByRole("complementary", { name: "Board" });
    const data = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.items.add(new File(["a,b\n1,2\n"], "values.csv", { type: "text/csv" }));
      return d;
    });
    await board.dispatchEvent("dragenter", { dataTransfer: data });
    await expect(board.getByText("Drop to pin")).toBeVisible();
    await board.dispatchEvent("drop", { dataTransfer: data });
    await expect(board.getByText("Drop to pin")).toHaveCount(0);
    await expect(board.getByText("values.csv")).toBeVisible();
    await board.getByRole("button", { name: "Send" }).click();
    await expect(board.getByRole("article").first().getByText("values.csv")).toBeVisible();
  });

  test("file too large: clear error, nothing is sent", async ({ page }) => {
    const board = page.getByRole("complementary", { name: "Board" });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), board.getByRole("button", { name: "Attach image or file" }).click()]);
    await chooser.setFiles({ name: "large.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
    await expect(board.getByRole("alert")).toHaveText("The file is too large (at most 10 MB).");
    await expect(board.getByRole("button", { name: "Send" })).toBeDisabled();
    await board.getByRole("button", { name: "Remove attachment" }).click();
    await expect(board.getByRole("alert")).toHaveCount(0);
  });

  test("edit an image's description in the popup", async ({ page }) => {
    const board = page.getByRole("complementary", { name: "Board" });
    await board.getByRole("article", { name: "Post by Clara" }).getByRole("button", { name: "Open · edit" }).click();
    const dialog = page.getByRole("dialog", { name: "Post by Clara" });
    await dialog.getByRole("button", { name: "Edit description" }).click();
    await dialog.getByRole("textbox", { name: "Edit description" }).fill("New sketch");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("New sketch")).toBeVisible();
  });
});

test("avatar image in the user area and on the user's own board cards (initials otherwise)", async ({ page }) => {
  await page.goto("/?fixture=edge-cases&talking=0");
  await expect(page.locator(".av-me img")).toBeVisible();
  await page.getByRole("button", { name: "Show board" }).click();
  const board = page.getByRole("complementary", { name: "Board" });
  await expect(board.getByRole("heading", { name: "Board" })).toBeVisible();
  await expect(board.getByRole("article", { name: "Post by Anna" }).locator(".av img")).toBeVisible();
  await expect(board.getByRole("article", { name: "Post by Clara" }).locator(".av img")).toHaveCount(0); // Clara without an image
});
