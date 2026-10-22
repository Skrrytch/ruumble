import { expect, test, type Page } from "@playwright/test";

// Tube mail (ADR-0022) against the mock: Anna is in "Let's talk" with Clara (Ruumble) and David (Mumble only); Ben
// (Ruumble) is in his office. In the mock the others accept a file after a moment and it "uploads" piece by piece.
test.describe("Tube mail", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=sample&talking=0&debug"));

  const person = (page: Page, name: string) => page.locator(".floorplan").getByRole("img", { name: new RegExp(`^${name}`) });
  const button = (page: Page) => page.locator("[data-tube-button]");
  const panel = (page: Page) => page.getByRole("region", { name: "Tube mail" });
  const dialog = (page: Page) => page.getByRole("dialog", { name: "Send a file" });
  const pdf = { name: "report.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(1_500_000, 1) };

  test("from the person card: choose a file, send it, and watch it arrive", async ({ page }) => {
    await person(page, "Clara").hover();
    await page.getByRole("group", { name: "Clara" }).getByRole("button", { name: "Send Clara a file" }).click();
    await expect(dialog(page).getByRole("checkbox", { name: /Clara/ })).toBeChecked();
    await expect(dialog(page).getByRole("checkbox", { name: /Ben/ })).not.toBeChecked();
    await expect(dialog(page)).toContainText("David, Felix, Hanna – without Ruumble");
    await expect(dialog(page).getByRole("button", { name: "Send to 1 person" })).toBeDisabled(); // no file yet
    await dialog(page).locator('input[type="file"]').setInputFiles(pdf);
    await expect(dialog(page)).toContainText("report.pdf");
    await expect(dialog(page)).toContainText("PDF · 1.4 MB");
    await dialog(page).getByRole("textbox", { name: "Note (optional)" }).fill("Page 3 is new");
    await dialog(page).getByRole("button", { name: "Send to 1 person" }).click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(panel(page)).toContainText("Outgoing");
    await expect(panel(page)).toContainText("Keep this tab open until everyone has the file.");
    await expect(panel(page).getByText(/^receiving · \d+ %$/)).toBeVisible();
    await expect(panel(page)).toContainText("received", { timeout: 10_000 });
    await expect(panel(page)).not.toContainText("Keep this tab open");
    await panel(page).getByRole("button", { name: "Put away" }).click();
    await expect(panel(page)).toContainText("No tube mail on its way right now.");
  });

  /** drag a file over `target` and drop it there; resolves with whether the page took the drop (prevented the default) */
  async function dropFile(page: Page, target: ReturnType<Page["locator"]>, name = "notes.txt"): Promise<boolean> {
    const data = await page.evaluateHandle((n) => {
      const dt = new DataTransfer();
      dt.items.add(new File(["hello"], n, { type: "text/plain" }));
      return dt;
    }, name);
    await target.dispatchEvent("dragover", { dataTransfer: data });
    return target.evaluate((el, dt) => !el.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true })), data);
  }

  test("a file dropped on a person goes to them alone, on a room to everyone with Ruumble there", async ({ page }) => {
    await dropFile(page, person(page, "Clara"));
    await expect(dialog(page).getByRole("checkbox", { name: /Clara/ })).toBeChecked();
    await expect(dialog(page).getByRole("checkbox", { name: /Ben/ })).not.toBeChecked();
    await expect(dialog(page)).toContainText("notes.txt");
    // the file row takes another file
    await dropFile(page, dialog(page).getByRole("group", { name: "notes.txt" }), "other.txt");
    await expect(dialog(page)).toContainText("other.txt");
    await dialog(page).getByRole("button", { name: "Close" }).first().click();
    await dropFile(page, page.locator(".floorplan").getByRole("button", { name: /^Ben's office/ }));
    await expect(dialog(page).getByRole("checkbox", { name: /Ben/ })).toBeChecked();
    await expect(dialog(page).getByRole("checkbox", { name: /Clara/ })).not.toBeChecked();
  });

  test("a file dropped anywhere else stays out: the page keeps it from opening in the tab", async ({ page }) => {
    expect(await dropFile(page, page.locator("header.topbar"))).toBe(true);
    await expect(dialog(page)).toHaveCount(0);
    await expect(page).toHaveURL(/fixture=sample/);
  });

  test("rooms are a quick choice; a parcel can be withdrawn", async ({ page }) => {
    await button(page).click();
    await panel(page).getByRole("button", { name: "Send a file …" }).click();
    await dialog(page).getByRole("button", { name: /^Let's talk/ }).click();
    await expect(dialog(page).getByRole("checkbox", { name: /Clara/ })).toBeChecked();
    await dialog(page).getByRole("button", { name: /^Let's talk/ }).click();
    await expect(dialog(page).getByRole("checkbox", { name: /Clara/ })).not.toBeChecked();
    await dialog(page).getByRole("checkbox", { name: /Ben/ }).check();
    await dialog(page).locator('input[type="file"]').setInputFiles(pdf);
    await dialog(page).getByRole("button", { name: "Send to 1 person" }).click();
    await panel(page).getByRole("button", { name: "Withdraw" }).click();
    await expect(panel(page)).toContainText("withdrawn");
  });

  test("received: a notice with the note; accepting downloads the file, and the count in the top bar goes", async ({ page }) => {
    await page.getByRole("button", { name: "Someone sends me a file" }).click();
    const toast = page.getByRole("status").filter({ hasText: "Tube mail from" });
    await expect(toast).toContainText("Quarterly report.pdf");
    await expect(toast).toContainText("Page 3 is new");
    await expect(button(page)).toHaveAccessibleName("Tube mail, 1 parcel waiting");
    const download = page.waitForEvent("download");
    await toast.getByRole("button", { name: "Accept" }).click();
    expect((await download).suggestedFilename()).toBe("Quarterly report.pdf");
    await expect(toast).toHaveCount(0);
    await expect(button(page)).toHaveAccessibleName("Tube mail");
  });

  test("a program comes with a warning; later keeps it in the panel, where it can be declined", async ({ page }) => {
    await page.getByRole("button", { name: "Someone sends me a program" }).click();
    const toast = page.getByRole("status").filter({ hasText: "Tube mail from" });
    await expect(toast).toContainText("This file can run programs.");
    await toast.getByRole("button", { name: "Later" }).click();
    await expect(toast).toHaveCount(0);
    await button(page).click();
    await expect(panel(page)).toContainText("setup.exe");
    await expect(panel(page)).toContainText("waiting for you");
    await panel(page).getByRole("button", { name: "Decline" }).click();
    await expect(panel(page)).toContainText("declined");
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(button(page)).toBeFocused();
  });
});
