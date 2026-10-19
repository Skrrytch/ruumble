import { expect, test } from "@playwright/test";
import { userMenu } from "./topbar.ts";

const html = (page: import("@playwright/test").Page) => page.locator("html");
const background = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("light system: switch to dark and back, the choice is remembered", async ({ page }) => {
  await page.goto("/?fixture=sample&talking=0");
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  expect(await background(page)).toBe("rgb(255, 255, 255)");

  const toggle = (await userMenu(page)).getByRole("button", { name: /^Dark mode/ });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(await background(page)).toBe("rgb(20, 24, 30)");
  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "dark"); // remembered

  await (await userMenu(page)).getByRole("button", { name: /^Dark mode/ }).click();
  await page.reload();
  await expect(html(page)).toHaveAttribute("data-theme", "light"); // remembered
});

test.describe("dark system", () => {
  test.use({ colorScheme: "dark" });

  test("dark from the first paint, until light is chosen", async ({ page }) => {
    // the theme is set before any module runs, so the page never shows white first
    await page.goto("/?fixture=sample&talking=0", { waitUntil: "commit" });
    await page.waitForSelector("html[data-theme]", { state: "attached" });
    await expect(html(page)).toHaveAttribute("data-theme", "dark");

    await (await userMenu(page)).getByRole("button", { name: /^Dark mode/ }).click();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(html(page)).toHaveAttribute("data-theme", "light");
  });

  test("follows a change of the system setting while no choice is made", async ({ page }) => {
    await page.goto("/?fixture=sample&talking=0");
    await expect(html(page)).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html(page)).toHaveAttribute("data-theme", "light");
  });
});
