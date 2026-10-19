import { expect, test, type Page } from "@playwright/test";

const board = (page: Page) => page.getByRole("complementary", { name: "Board" });
async function view(page: Page, name: string): Promise<void> {
  const button = board(page).getByRole("button", { name: "View" });
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await board(page).getByRole("menuitemradio", { name }).click();
  await page.keyboard.press("Escape"); // the menu stays open after a choice
}

test("compact posts: one line each, attachments and code as placeholders, remembered", async ({ page }) => {
  await page.goto("/?fixture=sample&talking=0");
  await page.getByRole("button", { name: "Show board" }).click();
  const image = board(page).getByRole("article", { name: /Clara/ }).first();
  const normal = (await image.boundingBox())!.height;

  await view(page, "Compact");
  // the image is a small placeholder with its caption beside it; it opens the post
  const placeholder = board(page).getByRole("button", { name: "Open whiteboard.png" });
  await expect(placeholder).toBeVisible();
  await expect(image.getByRole("img", { name: "Architecture sketch from the whiteboard" })).toHaveCount(0);
  expect((await image.boundingBox())!.height).toBeLessThan(normal / 3);
  // code: its first line; reactions stay right beside the message
  await expect(board(page).getByRole("button", { name: /^Open \/\/ fixes RUU-14/ })).toBeVisible();
  await expect(board(page).getByRole("button", { name: /Reactions/ }).first()).toBeVisible();
  // no header line: the actions bar names the author beside the time
  await image.hover();
  await expect(image.getByText("Clara", { exact: true })).toBeVisible();

  await placeholder.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await page.getByRole("button", { name: "Show board" }).click();
  await expect(board(page).getByRole("button", { name: "Open whiteboard.png" })).toBeVisible(); // remembered
  await view(page, "Normal");
  await expect(board(page).getByRole("button", { name: "Open whiteboard.png" })).toHaveCount(0);
});

test("view menu: stays open while choosing, closes on a click elsewhere or Escape", async ({ page }) => {
  await page.goto("/?fixture=sample&talking=0");
  await page.getByRole("button", { name: "Show board" }).click();
  const button = board(page).getByRole("button", { name: "View" });
  const menu = board(page).getByRole("menu", { name: "View" });
  await button.click();
  await menu.getByRole("menuitemradio", { name: "Compact" }).click();
  await menu.getByRole("menuitemradio", { name: "Floating" }).click();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio", { name: "Compact" })).toHaveAttribute("aria-checked", "true");
  await expect(menu.getByRole("menuitemradio", { name: "Floating" })).toHaveAttribute("aria-checked", "true");

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(button).toBeFocused();

  await button.click();
  await expect(menu).toBeVisible();
  await page.getByRole("heading", { name: "Development" }).click(); // a click elsewhere
  await expect(menu).toHaveCount(0);
});
