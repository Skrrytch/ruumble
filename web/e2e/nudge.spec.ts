import { expect, test } from "@playwright/test";
import { userMenu } from "./topbar.ts";

// Nudge (ADR-0020): Clara is in the own room (Let's talk) and uses Ruumble; the debug panel deafens her
test.describe("Nudge", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=sample&talking=0&debug"));

  const clara = (page: import("@playwright/test").Page) => page.locator(".floorplan").getByRole("img", { name: /^Clara,/ });

  test("only a deafened person shows the card with the nudge button", async ({ page }) => {
    await clara(page).hover();
    await expect(page.getByRole("button", { name: "Nudge Clara" })).toHaveCount(0);
    await page.getByRole("button", { name: "Someone in my room deafens" }).click();
    await expect(clara(page)).toHaveAccessibleName(/^Clara, deafened/);
    await clara(page).hover();
    const card = page.getByRole("group", { name: "Clara" });
    await expect(card).toContainText("has deafened Mumble and cannot hear you");
    await card.getByRole("button", { name: "Nudge Clara" }).click();
    await expect(page.getByRole("alert")).toHaveText(/Clara was nudged\./);
    await expect(card).toHaveCount(0);
    // once a minute
    await clara(page).hover();
    await page.getByRole("button", { name: "Nudge Clara" }).click();
    await expect(page.getByRole("alert")).toHaveText(/You just nudged Clara – again in a minute\./);
  });

  test("from the directory board: the bell beside a deafened person in the own room", async ({ page }) => {
    await page.getByRole("button", { name: "Someone in my room deafens" }).click();
    await page.keyboard.press("h");
    const overview = page.getByRole("dialog", { name: "Building overview" });
    await expect(overview.getByRole("button", { name: /^Nudge/ })).toHaveCount(1);
    await overview.getByRole("button", { name: "Nudge Clara" }).click();
    await expect(overview).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveText(/Clara was nudged\./);
  });

  test("being nudged: a notice; the sound can be switched off in the user menu and stays off", async ({ page }) => {
    await page.getByRole("button", { name: "Someone nudges me" }).click();
    await expect(page.getByRole("alert")).toHaveText(/Clara nudged you and would like your attention\./);
    const sound = (await userMenu(page)).getByRole("button", { name: /Sound when nudged/ });
    await expect(sound).toHaveAttribute("aria-pressed", "true");
    await sound.click();
    await expect(sound).toHaveAttribute("aria-pressed", "false");
    await page.reload();
    await expect((await userMenu(page)).getByRole("button", { name: /Sound when nudged/ })).toHaveAttribute("aria-pressed", "false");
  });
});
