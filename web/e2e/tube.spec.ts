import { expect, test, type Page } from "@playwright/test";

// Tube mail (ADR-0021) against the mock: Anna is in "Let's talk" with Clara (Ruumble) and David (Mumble only); Ben
// (Ruumble) is in his office. In the mock the others answer after a moment and come over when invited.
test.describe("Tube mail", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=sample&talking=0&debug"));

  const person = (page: Page, name: string) => page.locator(".floorplan").getByRole("img", { name: new RegExp(`^${name}`) });
  const panel = (page: Page) => page.getByRole("region", { name: "Tube mail" });
  const input = (page: Page, name: string) => panel(page).getByRole("textbox", { name: `Tube mail to ${name}` });

  async function openFromCard(page: Page, name: string): Promise<void> {
    await person(page, name).hover();
    await page.getByRole("group", { name }).getByRole("button", { name: `Tube mail to ${name}` }).click();
  }

  test("the person card offers tube mail to someone with Ruumble, not to someone without", async ({ page }) => {
    await person(page, "David").hover();
    await expect(page.getByRole("group", { name: "David" })).toHaveCount(0);
    await openFromCard(page, "Clara");
    await expect(panel(page).getByRole("tab", { name: "Clara" })).toHaveAttribute("aria-selected", "true");
    await expect(panel(page)).toContainText("Let's talk · Floor 1");
    await expect(panel(page)).toContainText("in the same room");
    await expect(panel(page)).toContainText("No tube mail with Clara yet.");
    await expect(input(page, "Clara")).toBeFocused();
  });

  test("write, get an answer and react to it", async ({ page }) => {
    await openFromCard(page, "Clara");
    await input(page, "Clara").fill("Lunch at noon?");
    await page.keyboard.press("Enter");
    await expect(panel(page).getByText("Lunch at noon?")).toBeVisible();
    await expect(input(page, "Clara")).toHaveValue("");
    await expect(panel(page).getByText("Sounds good!")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Tube mail from Clara" })).toHaveCount(0); // in view: no notice
    await panel(page).getByRole("button", { name: "React" }).click();
    await panel(page).getByRole("button", { name: "Agreed / fine by me", exact: true }).click();
    await expect(panel(page).getByRole("button", { name: "Agreed / fine by me: Anna" })).toHaveAttribute("aria-pressed", "true");
  });

  test("from the directory board: invite someone elsewhere, who answers and comes over", async ({ page }) => {
    await page.keyboard.press("h");
    const overview = page.getByRole("dialog", { name: "Building overview" });
    await overview.getByRole("button", { name: "Tube mail to Ben" }).click();
    await expect(overview).toHaveCount(0);
    await expect(panel(page)).toContainText("Ben's office · Floor 1");
    await expect(panel(page).getByRole("button", { name: "Go there" })).toBeVisible();
    await panel(page).getByRole("button", { name: "Invite Ben to your room" }).click();
    await expect(panel(page)).toContainText("You invited Ben to Let's talk.");
    await expect(panel(page).getByText("On my way!")).toBeVisible();
    await expect(page.locator('.floorplan [data-channel="3"]').getByRole("img", { name: /^Ben/ })).toBeVisible();
    await expect(panel(page)).toContainText("in the same room");
  });

  test("P on a person of the directory board opens their conversation", async ({ page }) => {
    await page.keyboard.press("h");
    const overview = page.getByRole("dialog", { name: "Building overview" });
    await overview.getByRole("button", { name: /^Go to Ben/ }).focus();
    await page.keyboard.press("p");
    await expect(panel(page).getByRole("tab", { name: "Ben" })).toHaveAttribute("aria-selected", "true");
  });

  test("being written to: a notice and the count in the top bar; an invitation leads there", async ({ page }) => {
    await page.getByRole("button", { name: "Someone sends me tube mail" }).click();
    const toast = page.getByRole("status").filter({ hasText: "Tube mail from Ben" });
    await expect(toast).toContainText("Hi Anna, do you have a minute?");
    await expect(page.getByRole("button", { name: "Tube mail, 1 unread message" })).toBeVisible();
    await toast.getByRole("button", { name: "Reply" }).click();
    await expect(toast).toHaveCount(0);
    await expect(panel(page).getByRole("tab", { name: "Ben" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "Tube mail", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Someone invites me over" }).click();
    await expect(panel(page)).toContainText("Ben invites you to Ben's office.");
    await panel(page).getByRole("button", { name: "Go to Ben's office" }).click();
    await expect(page).toHaveTitle("Ben's office · Ruumble");
    await expect(panel(page)).toContainText("You are there.");
  });

  test("P, comma and full stop, Escape into the station; kept after a reload until forgotten", async ({ page }) => {
    await openFromCard(page, "Clara");
    await input(page, "Clara").fill("First");
    await page.keyboard.press("Enter");
    await panel(page).getByRole("heading", { name: "Tube mail" }).click(); // out of the text field
    await page.keyboard.press("h");
    await page.getByRole("dialog", { name: "Building overview" }).getByRole("button", { name: "Tube mail to Ben" }).click();
    await expect(panel(page).getByRole("tab", { name: "Ben" })).toHaveAttribute("aria-selected", "true");

    await panel(page).getByRole("heading", { name: "Tube mail" }).click(); // out of the text field
    await page.keyboard.press(",");
    await expect(panel(page).getByRole("tab", { name: "Clara" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press(".");
    await expect(panel(page).getByRole("tab", { name: "Ben" })).toHaveAttribute("aria-selected", "true");

    await input(page, "Ben").press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Expand tube mail" }).click();
    await expect(panel(page)).toBeVisible();
    await panel(page).getByRole("heading", { name: "Tube mail" }).click();
    await page.keyboard.press("p");
    await expect(panel(page)).toHaveCount(0);

    await page.reload();
    await page.keyboard.press("p");
    await panel(page).getByRole("tab", { name: "Clara" }).click();
    await expect(panel(page).getByText("First")).toBeVisible();
    await panel(page).getByRole("button", { name: "Forget the history with Clara in this browser" }).click();
    await expect(panel(page).getByRole("tab", { name: "Clara" })).toHaveCount(0);
    await page.reload();
    await page.keyboard.press("p");
    await expect(panel(page).getByRole("tab", { name: "Ben" })).toBeVisible();
    await expect(panel(page).getByRole("tab", { name: "Clara" })).toHaveCount(0);
  });
});
