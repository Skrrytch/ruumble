import { expect, test } from "@playwright/test";
import { gotoFloor } from "./topbar.ts";

test.describe("Descriptions from Mumble", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=sample&talking=0"));

  test("the binders open a room's description; Escape closes it and the focus goes back", async ({ page }) => {
    // only rooms with a description have binders
    await expect(page.getByRole("button", { name: /^Description of / })).toHaveCount(2);
    const binders = page.getByRole("button", { name: "Description of Let's talk" });
    await binders.click();
    const popup = page.getByRole("dialog", { name: "Description of Let's talk" });
    await expect(popup).toBeVisible();
    await expect(popup.getByRole("heading", { name: "Let's talk" })).toBeVisible();
    await expect(popup).toContainText("Daily stand-up at 9:30.");
    await expect(popup.locator("[style]")).toHaveCount(0);
    await expect(binders).toHaveAttribute("aria-expanded", "true");

    // a third of the window wide, at most 80 % of its height, inside the window
    const box = (await popup.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(Math.abs(box.width - Math.max(320, viewport.width * 0.33))).toBeLessThan(2);
    expect(box.height).toBeLessThanOrEqual(viewport.height * 0.8 + 1);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(binders).toHaveAttribute("aria-expanded", "false");
    await expect(binders).toBeFocused();
  });

  test("a click beside it closes it", async ({ page }) => {
    await page.getByRole("button", { name: "Description of Let's talk" }).click();
    const popup = page.getByRole("dialog", { name: "Description of Let's talk" });
    await expect(popup).toBeVisible();
    await page.mouse.click(5, page.viewportSize()!.height - 5);
    await expect(popup).toBeHidden();
  });

  test("links open in a new tab and close it", async ({ page, context }) => {
    await context.route("https://example.com/**", (route) => route.fulfill({ body: "agenda" }));
    await page.getByRole("button", { name: "Description of Let's talk" }).click();
    const popup = page.getByRole("dialog", { name: "Description of Let's talk" });
    const link = popup.getByRole("link", { name: "example.com/agenda" });
    await expect(link).toHaveAttribute("target", "_blank");
    const [tab] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await expect(tab).toHaveURL("https://example.com/agenda");
    await expect(popup).toBeHidden();
  });

  test("the corridor and an open floor have binders too", async ({ page }) => {
    await page.getByRole("button", { name: "Description of Corridor Development" }).click();
    await expect(page.getByRole("dialog", { name: "Description of Corridor Development" })).toContainText("Floor of the development teams.");
    await page.keyboard.press("Escape");
    await gotoFloor(page, /Lobby/);
    await page.getByRole("button", { name: "Description of Lobby" }).click();
    await expect(page.getByRole("dialog", { name: "Description of Lobby" })).toContainText("Welcome to Acme HQ!");
  });
});
