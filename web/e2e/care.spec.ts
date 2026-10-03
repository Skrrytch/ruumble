import { expect, test } from "@playwright/test";
import { elevator } from "./topbar.ts";

// care of the stored data (ADR-0014): the sample fixture's own user (Anna) may tend everything, edge-cases nothing
test.describe("Care (ADR-0014)", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=sample&talking=0"));

  test("room care: shows what the board holds and clears it after asking", async ({ page }) => {
    await page.getByRole("button", { name: "Room care: Let's talk" }).click();
    const dialog = page.getByRole("dialog", { name: "Room care · Let's talk" });
    await expect(dialog.getByText(/^On the board: 4 posts/)).toBeVisible();
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

  test("floor care: the rooms that are gone, one line each, removed one by one or all", async ({ page }) => {
    await page.getByRole("button", { name: "Floor care: Development" }).click();
    const dialog = page.getByRole("dialog", { name: "Floor care · Development" });
    const rows = dialog.getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("Design review");
    await expect(rows.first()).toContainText(/4 posts · 2\.\d MB · gone since/);
    await expect(rows.last()).toContainText("12 posts · moved");
    page.once("dialog", (d) => void d.accept());
    await dialog.getByRole("button", { name: 'Remove "Design review" with its data' }).click();
    await expect(dialog.getByRole("status")).toHaveText("Removed: 4 posts.");
    await expect(rows).toHaveCount(1);
    await expect(dialog.getByRole("button", { name: "Remove all with their data" })).toHaveCount(0); // only for more than one
  });

  test("building care: the plant at the entrance lists the floors that are gone", async ({ page }) => {
    await (await elevator(page)).getByRole("button", { name: "Building care" }).click();
    const dialog = page.getByRole("dialog", { name: "Building care" });
    const floors = dialog.getByRole("list").first().getByRole("listitem");
    await expect(floors).toHaveCount(2);
    await expect(floors.first()).toContainText(/Marketing\s*2 rooms · 9 posts/);
    await expect(floors.last()).toContainText("Unknown floor");
    page.once("dialog", (d) => void d.accept());
    await dialog.getByRole("button", { name: "Remove all with their data" }).click();
    await expect(dialog.getByText("No orphaned floors.")).toBeVisible();
  });

  test("building care: the learned ticket links of the whole building, reset per project", async ({ page }) => {
    await (await elevator(page)).getByRole("button", { name: "Building care" }).click();
    const dialog = page.getByRole("dialog", { name: "Building care" });
    await expect(dialog.getByRole("listitem").filter({ hasText: "RUU" })).toContainText("jira.example.org/browse/");
    await dialog.getByRole("button", { name: "Reset RUU" }).click();
    await expect(dialog.getByRole("status")).toHaveText("Ticket link reset.");
    await expect(dialog.getByText("No ticket link is learned yet.")).toBeVisible();
  });

  test("without the permission the plants are only decoration", async ({ page }) => {
    await page.goto("/?fixture=edge-cases&talking=0");
    await expect(page.locator(".plant-spot").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Room|Floor) care/ })).toHaveCount(0);
    await expect((await elevator(page)).getByRole("button", { name: "Building care" })).toHaveCount(0);
  });
});
