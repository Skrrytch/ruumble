import { expect, test } from "@playwright/test";
import { elevator } from "./topbar.ts";

// care of the stored data (ADR-0014): the sample fixture's own user (Anna) may tend everything, edge-cases nothing
test.describe("Care (ADR-0014)", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=sample&talking=0"));

  test("room care: what the board holds, the retention, clear after asking", async ({ page }) => {
    await page.getByRole("button", { name: "Room care: Let's talk" }).click();
    const dialog = page.getByRole("dialog", { name: "Room care · Let's talk" });
    await expect(dialog.getByText(/^On the board: 4 posts/)).toBeVisible();
    await expect(dialog.getByText("Posts are deleted automatically after one year.")).toBeVisible();
    page.once("dialog", (d) => void d.dismiss()); // asked first: cancelled, nothing happens
    await dialog.getByRole("button", { name: "Clear the board" }).click();
    await expect(dialog.getByText(/^On the board: 4 posts/)).toBeVisible();
    page.once("dialog", (d) => void d.accept());
    await dialog.getByRole("button", { name: "Clear the board" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Board cleared, 4 posts deleted.");
    await expect(dialog.getByText("The board is empty.")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).last().click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Show board" }).click();
    await expect(page.getByRole("complementary", { name: "Board" }).getByText("Nothing pinned here yet.", { exact: false })).toBeVisible();
  });

  test("room care: delete posts older than a choice (no 1 year: that is the retention)", async ({ page }) => {
    await page.getByRole("button", { name: "Room care: Clara's office" }).click();
    const dialog = page.getByRole("dialog", { name: "Room care · Clara's office" });
    const older = dialog.getByLabel("Posts older than");
    await expect(older.locator("option")).toHaveText(["7 days (1 post)", "14 days (1 post)", "1 month (0 posts)", "3 months (0 posts)", "6 months (0 posts)"]);
    await older.selectOption({ label: "1 month (0 posts)" });
    await expect(dialog.getByRole("button", { name: "Delete old posts" })).toBeDisabled();
    await older.selectOption({ label: "14 days (1 post)" });
    page.once("dialog", (d) => void d.accept());
    await dialog.getByRole("button", { name: "Delete old posts" }).click();
    await expect(dialog.getByRole("status")).toHaveText("1 post deleted.");
    await expect(dialog.getByText("The board is empty.")).toBeVisible();
  });

  test("room care: export the board as a file", async ({ page }) => {
    await page.getByRole("button", { name: "Room care: Let's talk" }).click();
    const dialog = page.getByRole("dialog", { name: "Room care · Let's talk" });
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Export the board" }).click();
    expect((await download).suggestedFilename()).toBe("board-Let-s-talk.md"); // the mock exports Markdown, the service a ZIP
    await expect(dialog.getByRole("status")).toHaveText("Saved: board-Let-s-talk.md");
  });

  test("floor care: all rooms with their numbers, a line opens room care, back returns", async ({ page }) => {
    await page.getByRole("button", { name: "Floor care: Development" }).click();
    const dialog = page.getByRole("dialog", { name: "Floor care · Development" });
    const rooms = dialog.getByRole("list").first().getByRole("listitem");
    await expect(rooms).toHaveCount(5);
    await expect(rooms.first()).toContainText(/Let's talk\s*4 posts · \d+ KB · last/);
    await expect(rooms.nth(1)).toContainText(/Let's play\s*empty/);
    await dialog.getByRole("button", { name: "Room care: Let's talk" }).click();
    await expect(page.getByRole("dialog", { name: "Room care · Let's talk" })).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("dialog", { name: "Floor care · Development" })).toBeVisible();
  });

  test("floor care: move the board of a room that is gone to a room of this floor", async ({ page }) => {
    await page.getByRole("button", { name: "Floor care: Development" }).click();
    const dialog = page.getByRole("dialog", { name: "Floor care · Development" });
    await expect(dialog.getByRole("button", { name: "Move", exact: true })).toBeDisabled();
    await dialog.getByLabel("From").selectOption({ label: "Design review (Development) · 4 posts · gone" });
    await dialog.getByLabel("To").selectOption({ label: "Retrospective" });
    page.once("dialog", (d) => void d.accept());
    await dialog.getByRole("button", { name: "Move", exact: true }).click();
    await expect(dialog.getByRole("status")).toHaveText("4 posts moved.");
    await expect(dialog.getByRole("list").first().getByRole("listitem").filter({ hasText: "Retrospective" })).toContainText("4 posts");
    await expect(dialog.getByText("Design review").first()).toHaveCount(0);
  });

  test("floor care: the rooms that are gone, removed one by one", async ({ page }) => {
    await page.getByRole("button", { name: "Floor care: Development" }).click();
    const dialog = page.getByRole("dialog", { name: "Floor care · Development" });
    const gone = dialog.getByRole("list").last().getByRole("listitem");
    await expect(gone).toHaveCount(2);
    await expect(gone.first()).toContainText(/Design review\s*4 posts · 2\.\d MB · gone since/);
    await expect(gone.last()).toContainText("12 posts · moved");
    page.once("dialog", (d) => void d.accept());
    await dialog.getByRole("button", { name: 'Remove "Design review" with its data' }).click();
    await expect(dialog.getByRole("status")).toHaveText("Removed: 4 posts.");
    await expect(gone).toHaveCount(1);
  });

  test("building care: storage and floors, floors that are gone, ticket links", async ({ page }) => {
    await (await elevator(page)).getByRole("button", { name: "Building care" }).click();
    const dialog = page.getByRole("dialog", { name: "Building care" });
    await expect(dialog.getByText(/^[\d.]+ MB of 2 GB used$/)).toBeVisible();
    await expect(dialog.getByRole("meter", { name: "Storage used" })).toBeVisible();
    const lists = dialog.getByRole("list");
    await expect(lists.first().getByRole("listitem").filter({ hasText: "Development" })).toContainText(/2 rooms · 5 posts/);
    const floors = lists.nth(1).getByRole("listitem");
    await expect(floors).toHaveCount(2);
    await expect(floors.first()).toContainText(/Marketing\s*2 rooms · 9 posts/);
    await expect(floors.last()).toContainText("Unknown floor");
    page.once("dialog", (d) => void d.accept());
    await dialog.getByRole("button", { name: "Remove all with their data" }).click();
    await expect(dialog.getByText("No orphaned floors.")).toBeVisible();
    await expect(dialog.getByRole("listitem").filter({ hasText: "RUU" })).toContainText("jira.example.org/browse/");
    await dialog.getByRole("button", { name: "Reset RUU" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Ticket link reset.");
    await expect(dialog.getByText("No ticket link is learned yet.")).toBeVisible();
    await dialog.getByRole("button", { name: "Floor care: Support" }).click();
    await expect(page.getByRole("dialog", { name: "Floor care · Support" })).toBeVisible();
  });

  test("without the permission the plants are only decoration", async ({ page }) => {
    await page.goto("/?fixture=edge-cases&talking=0");
    await expect(page.locator(".plant-spot").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Room|Floor) care/ })).toHaveCount(0);
    await expect((await elevator(page)).getByRole("button", { name: "Building care" })).toHaveCount(0);
  });
});

// key cabinet (ADR-0015): everyone sees their own keys, admins everyone's
test.describe("Key cabinet (ADR-0015)", () => {
  test("own keys with this browser marked, everyone else's for an admin, revoke after asking", async ({ page }) => {
    await page.goto("/?fixture=sample&talking=0");
    await (await elevator(page)).getByRole("button", { name: "Key cabinet" }).click();
    const dialog = page.getByRole("dialog", { name: "Key cabinet" });
    const mine = dialog.getByRole("list").first().getByRole("listitem");
    await expect(mine).toHaveCount(3);
    await expect(mine.first()).toContainText(/Firefox on Linux\s*this browser/);
    await expect(mine.last()).toContainText("Unknown browser");
    await expect(dialog.getByRole("heading", { name: "Everyone else's keys" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Clara" })).toBeVisible();
    page.once("dialog", (d) => void d.accept());
    await dialog.getByRole("button", { name: 'Revoke the key "Safari on iOS"' }).click();
    await expect(mine).toHaveCount(2);
  });

  test("not an admin: only the own keys; revoking this browser's key unpairs it", async ({ page }) => {
    await page.goto("/?fixture=edge-cases&talking=0");
    await (await elevator(page)).getByRole("button", { name: "Key cabinet" }).click();
    const dialog = page.getByRole("dialog", { name: "Key cabinet" });
    await expect(dialog.getByRole("heading", { name: "Your keys" })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Everyone else's keys" })).toHaveCount(0);
    page.once("dialog", (d) => {
      expect(d.message()).toContain("This is the key of this browser");
      void d.accept();
    });
    await dialog.getByRole("button", { name: 'Revoke the key "Firefox on Linux"' }).click();
    await expect(page.getByText("This device is not paired yet.")).toBeVisible();
  });
});
