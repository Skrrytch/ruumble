import { expect, test } from "@playwright/test";
import { currentFloor, elevator, userMenu } from "./topbar.ts";

test("English browser: switch to German and back, the choice is remembered", async ({ page }) => {
  await page.goto("/?fixture=sample&talking=0");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(currentFloor(page)).toHaveAccessibleName("1st floor: Development, 4 on this floor – choose floor");

  await (await userMenu(page)).getByRole("button", { name: "Change language: Deutsch" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect((await elevator(page)).getByRole("button", { name: "1. Obergeschoss: Development" })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Pinnwand einblenden" }).click();
  const board = page.getByRole("complementary", { name: "Pinnwand" });
  await expect(board.getByRole("searchbox", { name: "Pinnwand durchsuchen" })).toHaveAttribute("placeholder", "4 Beiträge durchsuchen …");
  await board.getByRole("button", { name: "Beiträge filtern" }).click();
  await expect(board.getByRole("menuitemradio", { name: "Bilder" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(board.getByRole("textbox", { name: "Neuer Beitrag" })).toHaveAttribute("placeholder", "Etwas an die Pinnwand heften …");
  await page.reload();
  await expect(currentFloor(page)).toHaveAccessibleName("1. Obergeschoss: Development, 4 auf dieser Etage – Etage wählen"); // remembered

  await (await userMenu(page)).getByRole("button", { name: "Sprache wechseln: English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(currentFloor(page)).toHaveAccessibleName(/choose floor$/);
  await page.reload();
  await expect(currentFloor(page)).toHaveAccessibleName(/choose floor$/); // remembered
});

test("without pairing: English notice with English Mumble labels", async ({ page }) => {
  await page.goto("/?fixture=unpaired");
  await expect(page.getByText("Mumble is not connected.")).toBeVisible();
  await expect(page.getByText("Configure → Settings → Plugins → “Install plugin…”")).toBeVisible();
});

test.describe("German browser", () => {
  test.use({ locale: "de-DE" });

  test("UI in German", async ({ page }) => {
    await page.goto("/?fixture=sample&talking=0");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect((await elevator(page)).getByRole("button", { name: "1. Obergeschoss: Development" })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Let's talk – du bist hier" })).toBeVisible();
    await expect((await userMenu(page)).getByRole("button", { name: "Sprache wechseln: English" })).toBeVisible();
  });

  test("without pairing: German notice with German Mumble labels", async ({ page }) => {
    await page.goto("/?fixture=unpaired");
    await expect(page.getByText("Mumble ist nicht verbunden.")).toBeVisible();
    await expect(page.getByText("Konfigurieren → Einstellungen → Plugins → „Installiere Plugin …“")).toBeVisible();
  });
});
