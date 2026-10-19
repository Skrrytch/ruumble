import { expect, test, type Page } from "@playwright/test";

const board = (page: Page) => page.getByRole("complementary", { name: "Board" });
const floatButton = (page: Page) => board(page).getByRole("button", { name: "Let the board float" });
const box = async (page: Page, name: RegExp) => (await page.getByRole("button", { name }).boundingBox())!;

test("floating board: over the floor plan beside the own room, the choice is remembered", async ({ page }) => {
  await page.goto("/?fixture=sample&talking=0");
  await page.getByRole("button", { name: "Show board" }).click();
  const docked = (await box(page, /^Let's talk/)).width;

  await floatButton(page).click();
  await expect(floatButton(page)).toHaveAttribute("aria-pressed", "true");
  await expect(board(page)).toHaveClass(/floating/);
  // the floor plan gets the full width back, the board floats on the right, the own room at the top left stays free
  await expect.poll(async () => (await box(page, /^Let's talk/)).width).toBeGreaterThan(docked);
  await expect(board(page)).not.toHaveClass(/left/);
  const room = await box(page, /^Let's talk/);
  const panel = (await board(page).boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(room.x + room.width);

  // own room at the bottom right: the board moves to the left
  await page.getByRole("button", { name: /^Clara's office/ }).dispatchEvent("dblclick");
  await expect(page.getByRole("button", { name: /^Clara's office – you are here/ })).toBeVisible();
  await expect(board(page)).toHaveClass(/left/);
  await expect(board(page).getByRole("button", { name: "Hide board" })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Show board" }).click();
  await expect(board(page)).toHaveClass(/floating/); // remembered
  await floatButton(page).click();
  await expect(board(page)).not.toHaveClass(/floating/);
  await page.reload();
  await page.getByRole("button", { name: "Show board" }).click();
  await expect(floatButton(page)).toHaveAttribute("aria-pressed", "false"); // remembered
});
