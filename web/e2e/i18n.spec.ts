import { expect, test } from "@playwright/test";

test.describe("englischer Browser", () => {
  test.use({ locale: "en-US" });

  test("Oberfläche auf Englisch, Umschalter wechselt auf Deutsch und merkt es sich", async ({ page }) => {
    await page.goto("/?fixture=sample&talking=0");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("navigation", { name: "Elevator – floors" })).toBeVisible();
    await expect(page.getByRole("button", { name: "1st floor: Development" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("8 online", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Show board" }).click();
    const board = page.getByRole("complementary", { name: "Board" });
    await expect(board.getByText("4 posts")).toBeVisible();
    await expect(board.getByRole("button", { name: "Images" })).toBeVisible();
    await expect(board.getByRole("textbox", { name: "New post" })).toHaveAttribute("placeholder", "Pin something to the board …");

    await page.getByRole("button", { name: "Change language: Deutsch" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.getByRole("complementary", { name: "Pinnwand" }).getByText("4 Beiträge")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("navigation", { name: "Aufzug – Etagen" })).toBeVisible(); // remembered
  });

  test("ohne Kopplung: englischer Hinweis mit englischen Mumble-Bezeichnungen", async ({ page }) => {
    await page.goto("/?fixture=unpaired");
    await expect(page.getByText("Mumble is not connected.")).toBeVisible();
    await expect(page.getByText("Configure → Settings → Plugins → “Install plugin…”")).toBeVisible();
  });
});
