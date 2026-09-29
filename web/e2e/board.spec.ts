import { expect, test, type Locator } from "@playwright/test";

/** choose a kind in the filter menu of the board header */
async function filter(board: Locator, name: string): Promise<void> {
  await board.getByRole("button", { name: "Filter posts" }).click();
  await board.getByRole("menuitemradio", { name }).click();
}

test.describe("Board (AP11.2)", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=sample&talking=0"));

  test("hidden at first, the note in the user's own room shows and hides it", async ({ page }) => {
    await expect(page.getByRole("complementary", { name: "Board" })).toHaveCount(0);
    const toggle = page.getByRole("button", { name: "Show board" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    const board = page.getByRole("complementary", { name: "Board" });
    await expect(board.getByRole("heading", { name: "Board" })).toBeVisible();
    await expect(board.getByRole("searchbox", { name: "Search the board" })).toHaveAttribute("placeholder", "Search 4 posts …");
    await page.getByRole("button", { name: "Hide board" }).first().click();
    await expect(board).toHaveCount(0);
  });

  test("quick reactions: summary in the header, picker with counts, set and take back (A1)", async ({ page }) => {
    await page.getByRole("button", { name: "Show board" }).click();
    const code = page.getByRole("complementary", { name: "Board" }).getByRole("article", { name: "Post by Ben" }).filter({ has: page.locator(".hljs") });
    const summary = code.getByRole("button", { name: /^Reactions – / });
    await expect(summary).toHaveAccessibleName("Reactions – Agreed / fine by me: Clara, Anna; Unclear, let's talk: David");
    await expect(summary).toHaveText("3");
    // the summary opens the picker too; the own reaction is pressed, with who in the name
    await summary.click();
    const picker = code.getByRole("group", { name: "React" });
    const agree = picker.getByRole("button", { name: "Agreed / fine by me: Clara, Anna" });
    await expect(agree).toHaveAttribute("aria-pressed", "true");
    await expect(agree).toBeFocused(); // keyboard: focus on the first symbol
    await agree.click(); // Anna takes hers back, the picker closes
    await expect(picker).toHaveCount(0);
    await expect(summary).toHaveAccessibleName("Reactions – Agreed / fine by me: Clara; Unclear, let's talk: David");
    // the button in the toolbar, then a social reaction; Escape closes without choosing
    await code.getByRole("button", { name: "React", exact: true }).click();
    await picker.getByRole("button", { name: "Happy birthday" }).click();
    await expect(summary).toHaveText("3");
    await expect(summary).toHaveAccessibleName("Reactions – Agreed / fine by me: Clara; Unclear, let's talk: David; Happy birthday: Anna");
    await code.getByRole("button", { name: "React", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
  });

  test("search and filter in the header: status line with count, reset", async ({ page }) => {
    await page.getByRole("button", { name: "Show board" }).click();
    const board = page.getByRole("complementary", { name: "Board" });
    await board.getByRole("searchbox", { name: "Search the board" }).fill("GREET");
    await expect(board.getByRole("article")).toHaveCount(1);
    await expect(board.getByText("1 of 4 posts")).toBeVisible();
    await filter(board, "Images");
    await expect(board.getByText("0 of 4 posts · Images")).toBeVisible();
    await expect(board.getByText("Nothing found.")).toBeVisible();
    await board.getByRole("button", { name: "Clear filter and search" }).click();
    await expect(board.getByRole("article")).toHaveCount(4);
    await expect(board.getByRole("searchbox")).toHaveValue("");
  });

  test("input: one line until it has focus, then the tools", async ({ page }) => {
    await page.getByRole("button", { name: "Show board" }).click();
    const board = page.getByRole("complementary", { name: "Board" });
    await expect(board.getByRole("button", { name: "Attach image or file" })).toBeHidden();
    await board.getByRole("textbox", { name: "New post" }).click();
    await expect(board.getByRole("button", { name: "Attach image or file" })).toBeVisible();
    await board.getByRole("searchbox").click(); // focus elsewhere, nothing typed: one line again
    await expect(board.getByRole("button", { name: "Attach image or file" })).toBeHidden();
  });

  test("task list: detected strictly, ticking changes the progress and counts as an edit (A2)", async ({ page }) => {
    await page.getByRole("button", { name: "Show board" }).click();
    const board = page.getByRole("complementary", { name: "Board" });
    const input = board.getByRole("textbox", { name: "New post" });
    await input.fill("Not a list:\n- [ ] one\nand more text");
    await input.press("Control+Enter");
    await expect(board.getByRole("article").first().getByRole("checkbox")).toHaveCount(0);
    await input.fill("**Release** checklist\n\n- [ ] Tag\n- [x] Changelog\n- [ ] Deploy to `prod`");
    await input.press("Control+Enter");
    const card = board.getByRole("article").first();
    await expect(card.locator("strong", { hasText: "Release" })).toBeVisible();
    await expect(card.getByRole("img", { name: "1 of 3 tasks done" })).toHaveText("1/3");
    const deploy = card.getByRole("checkbox", { name: "Deploy to prod" });
    await expect(deploy).not.toBeChecked();
    await deploy.click();
    await expect(deploy).toBeChecked();
    await expect(card.getByRole("img", { name: "2 of 3 tasks done" })).toBeVisible();
    await expect(card.getByText("last edited by Anna")).toBeVisible();
    await card.getByRole("checkbox", { name: "Changelog" }).click();
    await expect(card.getByRole("checkbox", { name: "Changelog" })).not.toBeChecked();
    // also in the popup
    await card.getByRole("button", { name: "Open", exact: true }).click();
    await page.getByRole("dialog").getByRole("checkbox", { name: "Tag" }).click();
    await expect(page.getByRole("dialog").getByRole("checkbox", { name: "Tag" })).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(card.getByRole("img", { name: "2 of 3 tasks done" })).toBeVisible();
  });

  test("keyboard: B shows and hides the board, not while typing (tooltip names the key)", async ({ page }) => {
    const toggle = page.getByRole("button", { name: "Show board" });
    await expect(toggle).toHaveAttribute("title", "Show board (B)");
    await expect(toggle).toHaveAttribute("aria-keyshortcuts", "B");
    await page.keyboard.press("b");
    const board = page.getByRole("complementary", { name: "Board" });
    await expect(board).toBeVisible();
    await board.getByRole("textbox", { name: "New post" }).click();
    await page.keyboard.type("b");
    await expect(board.getByRole("textbox", { name: "New post" })).toHaveValue("b");
    await board.getByRole("textbox", { name: "New post" }).fill("");
    await page.locator("body").click({ position: { x: 5, y: 5 } }); // focus away from the input
    await page.keyboard.press("Control+b"); // browser shortcut: left alone
    await expect(board).toBeVisible();
    await page.keyboard.press("B");
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
    await notes.getByRole("button", { name: "Open", exact: true }).click();
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
    await code.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByRole("dialog").locator(".gutter")).toBeVisible();
  });

  test("pin with Ctrl+Enter, filter, delete", async ({ page }) => {
    await page.getByRole("button", { name: "Show board" }).click();
    const board = page.getByRole("complementary", { name: "Board" });
    const input = board.getByRole("textbox", { name: "New post" });
    await input.fill("Quick **note**");
    await input.press("Control+Enter");
    await expect(board.getByRole("searchbox", { name: "Search the board" })).toHaveAttribute("placeholder", "Search 5 posts …");
    await expect(board.getByRole("article").first().locator("strong", { hasText: "note" })).toBeVisible();
    await expect(input).toHaveValue("");
    await filter(board, "Code");
    await expect(board.getByRole("article")).toHaveCount(1);
    await filter(board, "All");
    // delete own post
    page.once("dialog", (d) => d.accept());
    await board.getByRole("article").first().getByRole("button", { name: "Open", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(board.getByRole("searchbox", { name: "Search the board" })).toHaveAttribute("placeholder", "Search 4 posts …");
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
    await board.getByRole("textbox", { name: "New post" }).click(); // the tools appear once the input has focus
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
    await expect(board.getByRole("searchbox", { name: "Search the board" })).toHaveAttribute("placeholder", "Search 5 posts …");
    await filter(board, "Files");
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
    await expect(card.getByRole("link", { name: "Download" })).toHaveAttribute("download", /^image-.*\.png$/); // images: download icon in the toolbar
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
    await board.getByRole("textbox", { name: "New post" }).click(); // the tools appear once the input has focus
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), board.getByRole("button", { name: "Attach image or file" }).click()]);
    await chooser.setFiles({ name: "large.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
    await expect(board.getByRole("alert")).toHaveText("The file is too large (at most 10 MB).");
    await expect(board.getByRole("button", { name: "Send" })).toBeDisabled();
    await board.getByRole("button", { name: "Remove attachment" }).click();
    await expect(board.getByRole("alert")).toHaveCount(0);
  });

  test("edit an image's description in the popup", async ({ page }) => {
    const board = page.getByRole("complementary", { name: "Board" });
    await board.getByRole("article", { name: "Post by Clara" }).getByRole("button", { name: "Open", exact: true }).click();
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
