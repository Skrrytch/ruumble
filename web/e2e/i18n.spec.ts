import { expect, test } from "@playwright/test";

test("English browser: switch to German and back, the choice is remembered", async ({ page }) => {
  await page.goto("/?fixture=sample&talking=0");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("navigation", { name: "Elevator – floors" })).toBeVisible();

  await page.getByRole("button", { name: "Change language: Deutsch" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.getByRole("button", { name: "1. Obergeschoss: Development" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Pinnwand einblenden" }).click();
  const board = page.getByRole("complementary", { name: "Pinnwand" });
  await expect(board.getByText("4 Beiträge")).toBeVisible();
  await expect(board.getByRole("button", { name: "Bilder" })).toBeVisible();
  await expect(board.getByRole("textbox", { name: "Neuer Beitrag" })).toHaveAttribute("placeholder", "Etwas an die Pinnwand heften …");
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Aufzug – Etagen" })).toBeVisible(); // remembered

  await page.getByRole("button", { name: "Sprache wechseln: English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("navigation", { name: "Elevator – floors" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Elevator – floors" })).toBeVisible(); // remembered
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
    await expect(page.getByRole("navigation", { name: "Aufzug – Etagen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "1. Obergeschoss: Development" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: "Let's talk – du bist hier" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sprache wechseln: English" })).toBeVisible();
  });

  test("without pairing: German notice with German Mumble labels", async ({ page }) => {
    await page.goto("/?fixture=unpaired");
    await expect(page.getByText("Mumble ist nicht verbunden.")).toBeVisible();
    await expect(page.getByText("Konfigurieren → Einstellungen → Plugins → „Installiere Plugin …“")).toBeVisible();
  });
});
