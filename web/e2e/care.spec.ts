import { expect, test } from "@playwright/test";
import { overviewSection, userMenu } from "./topbar.ts";

// care of the stored data (ADR-0014): the sample fixture's own user (Anna) may tend everything, edge-cases nothing
test.describe("Care (ADR-0014)", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=sample&talking=0"));

  test("room care: what the board holds, house rules, clear after confirming in the dialog", async ({ page }) => {
    await page.getByRole("button", { name: "Room care: Let's talk" }).click();
    const dialog = page.getByRole("dialog", { name: "Room care" });
    await expect(dialog.getByRole("region", { name: "What the board holds" })).toContainText(/Posts\s*4/);
    await expect(dialog.getByText("Posts are deleted automatically after one year. Deleting is final.")).toBeVisible();
    await expect(dialog.getByRole("navigation", { name: "Breadcrumb" })).toContainText(/Building\s*›\s*Development\s*›\s*Let's talk/);
    await dialog.getByRole("button", { name: "Clear the board …" }).click();
    const confirm = dialog.getByRole("alertdialog", { name: "Delete all 4 posts for good?" });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape"); // only the confirmation closes
    await expect(confirm).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Clear the board …" }).click();
    await dialog.getByRole("button", { name: "Delete for good" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Board cleared, 4 posts deleted.");
    await expect(dialog.getByRole("region", { name: "What the board holds" })).toContainText(/Posts\s*0/);
    await dialog.getByRole("button", { name: "Close" }).last().click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Show board" }).click();
    await expect(page.getByRole("complementary", { name: "Board" }).getByText("Nothing pinned here yet.", { exact: false })).toBeVisible();
  });

  test("room care: delete posts older than a chosen age (no 1 year: that is the retention)", async ({ page }) => {
    await page.getByRole("button", { name: "Room care: Clara's office" }).click();
    const dialog = page.getByRole("dialog", { name: "Room care" });
    const ages = dialog.getByRole("group", { name: "Delete posts older than" });
    await expect(ages.getByRole("radio")).toHaveCount(5);
    await expect(ages.getByRole("radio", { name: "1 month 0" })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Delete posts …" })).toBeDisabled(); // nothing chosen yet
    await ages.getByText("14 days").click();
    await dialog.getByRole("button", { name: "Delete 1 post …" }).click();
    await expect(dialog.getByRole("alertdialog")).toContainText("Older than 14 days");
    await dialog.getByRole("button", { name: "Delete for good" }).click();
    await expect(dialog.getByRole("status")).toHaveText("1 post deleted.");
    await expect(dialog.getByRole("button", { name: "Delete posts …" })).toBeDisabled();
  });

  test("room care: export the board as a file (browser download where there is no Save as dialog)", async ({ page }) => {
    await page.addInitScript(() => delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker);
    await page.reload();
    await page.getByRole("button", { name: "Room care: Let's talk" }).click();
    const dialog = page.getByRole("dialog", { name: "Room care" });
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Export as ZIP" }).click();
    expect((await download).suggestedFilename()).toBe("board-Let-s-talk.md"); // the mock exports Markdown, the service a ZIP
    await expect(dialog.getByRole("status")).toHaveText("Saved: board-Let-s-talk.md");
  });

  test("room care: export through the Save as dialog, streamed into the chosen file; cancelling says nothing", async ({ page }) => {
    // stand-in for Chromium's File System Access API: records the suggested name and what is written
    await page.addInitScript(() => {
      const w = window as unknown as { saved: { name: string; text: string; cancel: boolean }; showSaveFilePicker: unknown };
      w.saved = { name: "", text: "", cancel: false };
      w.showSaveFilePicker = async ({ suggestedName }: { suggestedName: string }) => {
        if (w.saved.cancel) throw new DOMException("cancelled", "AbortError");
        w.saved.name = suggestedName;
        const decoder = new TextDecoder();
        return { createWritable: async () => new WritableStream({ write: (chunk: Uint8Array) => void (w.saved.text += decoder.decode(chunk, { stream: true })) }) };
      };
    });
    await page.reload();
    await page.getByRole("button", { name: "Room care: Let's talk" }).click();
    const dialog = page.getByRole("dialog", { name: "Room care" });
    await dialog.getByRole("button", { name: "Export as ZIP" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Saved: board-Let-s-talk.md");
    const saved = await page.evaluate(() => (window as unknown as { saved: { name: string; text: string } }).saved);
    expect(saved.name).toBe("board-Let-s-talk.md");
    expect(saved.text).toContain('# Board of "Let\'s talk"');
    // cancelled in the dialog: no message, no error
    await page.reload();
    await page.evaluate(() => void ((window as unknown as { saved: { cancel: boolean } }).saved.cancel = true));
    await page.getByRole("button", { name: "Room care: Let's talk" }).click();
    await dialog.getByRole("button", { name: "Export as ZIP" }).click();
    await expect(dialog.getByRole("button", { name: "Export as ZIP" })).toBeEnabled();
    await expect(dialog.getByRole("status")).toHaveCount(0);
    await expect(dialog.getByRole("alert")).toHaveCount(0);
  });

  test("floor care: rooms as a list, a line opens room care, back and the breadcrumb return", async ({ page }) => {
    await page.getByRole("button", { name: "Floor care: Development" }).click();
    const dialog = page.getByRole("dialog", { name: "Floor care" });
    await expect(dialog.getByText("5 rooms · 5 posts", { exact: false })).toBeVisible();
    const rooms = dialog.getByRole("button", { name: /^Let's talk/ });
    await expect(rooms).toContainText(/Let's talk\s*4/);
    await expect(dialog.getByRole("button", { name: /^Let's play/ })).toContainText("empty");
    await rooms.click();
    await expect(page.getByRole("dialog", { name: "Room care" })).toBeVisible();
    await page.getByRole("button", { name: "Back to floor care" }).click();
    await expect(page.getByRole("dialog", { name: "Floor care" })).toBeVisible();
    await page.getByRole("dialog", { name: "Floor care" }).getByRole("button", { name: /^Clara's office/ }).click();
    await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "Building" }).click();
    await expect(page.getByRole("dialog", { name: "Building care" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Back to/ })).toHaveCount(0);
  });

  test("floor care: move the board of a room that is gone, after confirming", async ({ page }) => {
    await page.getByRole("button", { name: "Floor care: Development" }).click();
    const dialog = page.getByRole("dialog", { name: "Floor care" });
    await expect(dialog.getByRole("button", { name: "Move the board" })).toBeDisabled();
    await dialog.getByLabel("From").selectOption({ label: "Design review · 4 posts · gone" });
    await dialog.getByLabel("To").selectOption({ label: "Retrospective" });
    await dialog.getByRole("button", { name: "Move the board" }).click();
    await expect(dialog.getByRole("alertdialog", { name: "Move 4 posts from Design review to Retrospective?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Move", exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText("4 posts moved.");
    await expect(dialog.getByRole("button", { name: /^Retrospective/ })).toContainText(/Retrospective\s*4/);
  });

  test("floor care: rooms that are gone, removed one by one", async ({ page }) => {
    await page.getByRole("button", { name: "Floor care: Development" }).click();
    const dialog = page.getByRole("dialog", { name: "Floor care" });
    await expect(dialog.getByRole("heading", { name: "Gone (2)" })).toBeVisible();
    await expect(dialog.getByText(/^4 posts · 2\.\d MB · goes in \d days$/)).toBeVisible();
    await expect(dialog.getByText("12 posts · moved")).toBeVisible();
    await dialog.getByRole("button", { name: "Remove Design review" }).click();
    await expect(dialog.getByRole("alertdialog", { name: "Remove Design review for good?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Remove for good" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Removed: 4 posts.");
    await expect(dialog.getByRole("heading", { name: "Gone (1)" })).toBeVisible();
  });

  test("building care: meter reading, floors from the top, floors that are gone, ticket links", async ({ page }) => {
    await (await overviewSection(page)).getByRole("button", { name: "Building care" }).click();
    const dialog = page.getByRole("dialog", { name: "Building care" });
    await expect(dialog.getByRole("meter", { name: "Storage used" })).toBeVisible();
    await expect(dialog.getByRole("region", { name: "Meter reading" })).toContainText(/MB of 2 GB/);
    await expect(dialog.getByRole("button", { name: /Development/ })).toContainText("5 rooms · 5 posts");
    await expect(dialog.getByRole("button", { name: /Support|Development|Lobby/ })).toHaveText([/Support/, /Development/, /Lobby/]);
    await expect(dialog.getByRole("heading", { name: "Gone (2)" })).toBeVisible();
    await dialog.getByRole("button", { name: "Remove all …" }).click();
    await expect(dialog.getByRole("alertdialog", { name: "Remove 2 orphaned floors for good?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Remove for good" }).click();
    await expect(dialog.getByText("No floors that are gone.")).toBeVisible();
    // one ticket link, so no "Reset all"; a reset asks first
    await expect(dialog.getByRole("button", { name: "Reset all …" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Reset RUU" }).click();
    const reset = dialog.getByRole("alertdialog", { name: "Reset the ticket link of RUU?" });
    await expect(reset).toContainText("Links in older posts then no longer lead to the ticket.");
    await reset.getByRole("button", { name: "Reset" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Ticket link reset.");
    await expect(dialog.getByText("No ticket links learned yet.")).toBeVisible();
    await dialog.getByRole("button", { name: /Support/ }).click();
    await expect(page.getByRole("dialog", { name: "Floor care" })).toBeVisible();
  });

  test("without the permission the plants are only decoration", async ({ page }) => {
    await page.goto("/?fixture=edge-cases&talking=0");
    await expect(page.locator(".plant-spot").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Room|Floor) care/ })).toHaveCount(0);
    await expect((await overviewSection(page)).getByRole("button", { name: "Building care" })).toHaveCount(0);
  });
});

// my keys (ADR-0015): everyone sees their own in the user menu; admins everyone else's in the building maintenance
test.describe("Keys (ADR-0015)", () => {
  test("my keys in the user menu, this browser marked, revoke after confirming", async ({ page }) => {
    await page.goto("/?fixture=sample&talking=0");
    await (await userMenu(page)).getByRole("button", { name: "My keys" }).click();
    const dialog = page.getByRole("dialog", { name: "My keys" });
    const mine = dialog.getByRole("listitem");
    await expect(mine).toHaveCount(3);
    await expect(mine.first()).toContainText(/Firefox on Linux\s*this browser/);
    await expect(mine.last()).toContainText("Unknown browser");
    await expect(dialog.getByText("Ben")).toHaveCount(0); // others are in the building maintenance
    await dialog.getByRole("button", { name: 'Revoke the key "Safari on iOS"' }).click();
    await expect(dialog.getByRole("alertdialog", { name: 'Revoke the key "Safari on iOS"?' })).toBeVisible();
    await dialog.getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(mine).toHaveCount(2);
  });

  test("revoking this browser's key unpairs it", async ({ page }) => {
    await page.goto("/?fixture=edge-cases&talking=0");
    await (await userMenu(page)).getByRole("button", { name: "My keys" }).click();
    const dialog = page.getByRole("dialog", { name: "My keys" });
    await dialog.getByRole("button", { name: 'Revoke the key "Firefox on Linux"' }).click();
    await expect(dialog.getByRole("alertdialog")).toContainText("This is the key of this browser");
    await dialog.getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(page.getByText("This device is not paired yet.")).toBeVisible();
  });
});

// building maintenance (ADR-0016): the lantern beside the building in the building overview, for admins only
test.describe("Building maintenance (ADR-0016)", () => {
  test("settings with defaults, saved after confirming, the largest file reaches the board; everyone else's keys", async ({ page }) => {
    await page.goto("/?fixture=sample&talking=0");
    await (await overviewSection(page)).getByRole("button", { name: "Building maintenance" }).click();
    const dialog = page.getByRole("dialog", { name: "Building maintenance" });
    const retention = dialog.getByLabel("Keep posts for");
    await expect(retention).toHaveValue("365");
    await expect(dialog.getByText("Default: 2048 · used:", { exact: false })).toBeVisible();
    await expect(dialog.getByText("Changes apply at once. The cleanup runs hourly.")).toBeVisible();
    const save = dialog.getByRole("button", { name: "Save" });
    await expect(save).toBeDisabled();
    await retention.fill("0");
    await expect(dialog.getByRole("alert")).toHaveText("Whole numbers within the allowed range only.");
    await expect(save).toBeDisabled();
    await retention.fill("90");
    await expect(dialog.getByRole("alert")).toHaveText(/^Shorter retention/);
    await dialog.getByLabel("Largest file").fill("25");
    await dialog.getByLabel("Notice in Mumble for new posts").uncheck();
    await save.click();
    await expect(dialog.getByRole("alertdialog", { name: "Save, although posts will then be deleted?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Save anyway" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Saved.");
    await expect(save).toBeDisabled();
    // a shorter grace for deleted rooms deletes data too: asks first; Escape cancels only the popup
    await dialog.getByLabel("Keep data of deleted rooms").fill("0");
    await expect(dialog.getByRole("alert")).toHaveText(/^Shorter grace period/);
    await save.click();
    const grace = dialog.getByRole("alertdialog", { name: "Save, although posts will then be deleted?" });
    await expect(grace).toContainText("Shorter grace period");
    await expect(grace.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(grace).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "All to default" }).click();
    await expect(retention).toHaveValue("365");
    // everyone else's keys
    await expect(dialog.getByRole("heading", { name: "Access" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Clara" })).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).last().click();
    await page.getByRole("button", { name: "Show board" }).click();
    const board = page.getByRole("complementary", { name: "Board" });
    await board.getByRole("textbox", { name: "New post" }).click(); // the tools appear with focus
    await expect(board.getByRole("button", { name: "Attach image or file" })).toHaveAttribute("title", /25 MB/);
  });

  test("no maintenance without the permission: the lantern is only decoration", async ({ page }) => {
    await page.goto("/?fixture=edge-cases&talking=0");
    await expect((await overviewSection(page)).getByRole("button", { name: "Building maintenance" })).toHaveCount(0);
  });
});
