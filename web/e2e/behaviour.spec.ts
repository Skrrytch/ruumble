import { expect, test } from "@playwright/test";
import { currentFloor, elevator, gotoFloor, userMenu } from "./topbar.ts";

test.describe("Sample building", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=sample&talking=0"));

  test("starts on the user's own floor with their own room marked", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Development" })).toBeVisible();
    await expect(currentFloor(page)).toHaveAccessibleName("1st floor: Development, 4 on this floor – choose floor");
    await expect(page.getByRole("status", { name: "You are here: Let's talk, 3 people" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Let's talk – you are here" })).toBeVisible();
    const lift = await elevator(page);
    await expect(lift.getByRole("button", { name: "1st floor: Development" })).toHaveAttribute("aria-current", "page");
    // the whole building in the elevator's status bar
    await expect(lift.getByText("8 online", { exact: true })).toBeVisible();
    await expect(lift.getByText("Acme HQ")).toBeVisible();
  });

  test("top bar: the elevator and the user menu open as dropdowns, Escape and a click elsewhere close them", async ({ page }) => {
    const lift = await elevator(page);
    await expect(lift.getByRole("button", { name: "1st floor: Development" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(lift).toHaveCount(0);
    await expect(currentFloor(page)).toBeFocused();
    const menu = await userMenu(page);
    await expect(menu.getByText("Let's talk · Floor 1")).toBeVisible();
    await expect(menu.getByText(/^Server \d/)).toBeVisible();
    await expect(menu.getByText(/^Interface \d/)).toBeVisible();
    await page.getByRole("heading", { name: "Development" }).click(); // opens the elevator, closes the menu
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Elevator – floors" })).toBeVisible();
    await page.locator(".room.corridor").click({ position: { x: 600, y: 20 } });
    await expect(page.getByRole("navigation", { name: "Elevator – floors" })).toHaveCount(0);
    // the floor plan starts at the left edge: no column for the elevator any more
    expect(Math.abs((await page.locator(".plan").boundingBox())!.x - (await page.locator(".topbar").boundingBox())!.x)).toBeLessThan(1);
  });

  test("clicking a room moves only after confirmation", async ({ page }) => {
    await page.getByRole("button", { name: "Clara's office – enter" }).click();
    await expect(page.getByRole("button", { name: "Clara's office – entering" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Clara's office – you are here" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Let's talk – enter" })).toBeVisible();
    await page.getByRole("button", { name: "Corridor Development – enter" }).click();
    await expect(page.getByRole("button", { name: "Corridor Development – you are here" })).toBeVisible();
  });

  test("floor button only changes the view, “Go to my floor” goes back", async ({ page }) => {
    await gotoFloor(page, "Ground floor: Lobby");
    await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
    await expect(page.getByText("Open floor without offices · 2 people")).toBeVisible();
    await (await userMenu(page)).getByRole("button", { name: "Go to my floor" }).click();
    await expect(page.getByRole("heading", { name: "Development" })).toBeVisible();
    // from another floor the room sign leads back too
    await gotoFloor(page, "Ground floor: Lobby");
    await page.getByRole("button", { name: "You are here: Let's talk, 3 people – Go to my floor" }).click();
    await expect(page.getByRole("heading", { name: "Development" })).toBeVisible();
  });

  test("mute and deafen with Mumble's semantics", async ({ page }) => {
    const mute = page.getByRole("button", { name: "Mute microphone" });
    const deaf = page.getByRole("button", { name: "Deafen" });
    await deaf.click();
    await expect(deaf).toHaveAttribute("aria-pressed", "true");
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    await mute.click(); // unmute also lifts deaf
    await expect(mute).toHaveAttribute("aria-pressed", "false");
    await expect(deaf).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("img", { name: "Anna (you)" })).toBeVisible();
  });
});

test.describe("Edge cases", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=edge-cases&talking=0"));

  test("locked floors are visible but cannot be selected", async ({ page }) => {
    const archive = (await elevator(page)).getByRole("button", { name: "3rd floor: ARCHIVE – locked: Channel structure too deep" });
    await expect(archive).toHaveAttribute("aria-disabled", "true");
    await archive.click({ force: true }); // aria-disabled: otherwise Playwright does not click at all
    await expect(page.getByRole("heading", { name: "DEVELOPMENT" })).toBeVisible();
    await expect(page.getByRole("button", { name: /EXTERNAL|PARTNERS/ })).toHaveCount(0);
  });

  test("many rooms: 3 per row in view, only the floor plan scrolls sideways, also with the wheel", async ({ page }) => {
    await gotoFloor(page, "4th floor: OPEN SPACE");
    const plan = page.locator(".floorplan");
    await expect(plan.locator(".row.top .room")).toHaveCount(4);
    await expect(plan.locator(".row.bottom .room")).toHaveCount(5);
    const { scrollWidth, clientWidth } = await plan.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollWidth / clientWidth).toBeCloseTo(5 / 3, 1);
    // Desk 2 has someone in it: wider than the empty Desk 1 next to it
    const desk = async (name: string) => (await plan.getByRole("button", { name: new RegExp(`^${name}`) }).boundingBox())!.width;
    expect(await desk("Desk 2")).toBeGreaterThan((await desk("Desk 1")) * 1.2);
    const bar = await page.locator(".topbar").boundingBox();
    await plan.hover();
    await page.mouse.wheel(0, 300);
    await expect.poll(() => plan.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    expect(await page.locator(".topbar").boundingBox()).toEqual(bar);
    // the corridor's label stays in view
    const corridor = await plan.locator(".room.corridor .label").boundingBox();
    const view = (await plan.boundingBox())!;
    expect(corridor!.x).toBeGreaterThanOrEqual(view.x);
  });

  test("entrance, lock, listeners, status icons", async ({ page }) => {
    await expect((await elevator(page)).getByRole("region", { name: "Entrance" }).getByRole("img")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(page.getByTitle("1 person is listening")).toBeVisible();
    await expect(page.getByRole("img", { name: "Nils, muted by the server" })).toBeVisible();
    await expect(page.getByTitle("Muted by the server", { exact: true })).toHaveCount(2); // Nils (suppressed), Mia (server mute)
    await gotoFloor(page, "Ground floor: Lobby");
    await expect(page.locator(".floorplan").getByTitle("Muted", { exact: true })).toHaveCount(1); // Ben
    await expect(page.locator(".floorplan").getByTitle("Deafened", { exact: true })).toHaveCount(1); // Felix
    await (await userMenu(page)).getByRole("button", { name: "Go to my floor" }).click();
    await gotoFloor(page, "2nd floor: SALES");
    const locked = page.getByRole("button", { name: "Gregor's office – no access" });
    await expect(locked).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("button", { name: /Kitchen|Coffee corner/ })).toHaveCount(0);
  });
});

test("locked room: clicking does nothing", async ({ page }) => {
  await page.goto("/?fixture=edge-cases&talking=0");
  await gotoFloor(page, "2nd floor: SALES");
  await page.getByRole("button", { name: "Gregor's office – no access" }).click({ force: true });
  await expect(page.getByRole("button", { name: "Gregor's office – no access" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("unconfirmed move shows a notice after 3 s, the user stays in the room", async ({ page }) => {
  await page.goto("/?fixture=sample&talking=0&debug");
  await page.getByRole("button", { name: "Reject next move" }).click();
  await page.getByRole("button", { name: "Ben's office – enter" }).click();
  await expect(page.getByRole("button", { name: "Ben's office – entering" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText(/Cannot move to “Ben's office”/, { timeout: 6000 });
  await expect(page.getByRole("button", { name: "Let's talk – you are here" })).toBeVisible();
});

test("rapid clicks: the last room wins", async ({ page }) => {
  await page.goto("/?fixture=sample&talking=0");
  for (const name of ["Let's play", "Retrospective", "Clara's office"]) await page.getByRole("button", { name: `${name} – enter` }).click();
  await expect(page.getByRole("button", { name: "Clara's office – you are here" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("adding a subchannel locks the user's own floor live", async ({ page }) => {
  await page.goto("/?fixture=sample&talking=0&debug");
  await page.getByRole("button", { name: "Add subchannel in the first room" }).click();
  await expect(page.getByText("You are in an area that cannot be shown here.")).toBeVisible();
  await expect((await elevator(page)).getByRole("button", { name: /Development – locked/ })).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Remove new subchannels" }).click();
  await expect(page.getByRole("button", { name: "Let's talk – you are here" })).toBeVisible();
});

test("avatars, presence and recording (AP9/AP10)", async ({ page }) => {
  await page.goto("/?fixture=edge-cases&talking=0");
  await expect(page.locator(".floorplan img").first()).toBeVisible(); // Anna's avatar (mock SVG)
  await gotoFloor(page, "Ground floor: Lobby");
  await expect(page.getByRole("img", { name: "Ben, muted, quiet for 20 min" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Felix, deafened, away" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Eva, recording" })).toBeVisible();
  await expect(page.getByText("● Recording")).toBeVisible();
});

test("broken avatar image: initials instead of the image", async ({ page }) => {
  await page.route("**/*", (route) => route.continue());
  await page.goto("/?fixture=edge-cases&talking=0");
  await page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>(".floorplan img");
    if (img) img.src = "/does-not-exist.png";
  });
  await expect(page.locator(".floorplan img")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Anna (you)" })).toContainText("An");
});

test("vacant building", async ({ page }) => {
  await page.goto("/?fixture=vacant&talking=0");
  await expect(page.getByRole("heading", { name: "Vacant" })).toBeVisible();
  await expect(page.getByText("No floor of this building can be shown", { exact: false })).toBeVisible();
});

test("without a paired plugin: notice instead of the building", async ({ page }) => {
  await page.goto("/?fixture=unpaired&talking=0");
  await expect(page.getByText("Mumble is not connected.")).toBeVisible();
  await expect(currentFloor(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Download the Ruumble plugin" })).toHaveAttribute("href", "/download");
  await expect(page.getByText(/^Ruumble service \d+\.\d+\.\d+ · plugin \d+\.\d+\.\d+$/)).toBeVisible();
});

test("not paired: pair this browser with a code from the Mumble log (ADR-0012)", async ({ page }) => {
  await page.goto("/?fixture=sample&paired=0&talking=0");
  await expect(page.getByText("This device is not paired yet.")).toBeVisible();
  await page.getByRole("button", { name: "Pair this browser" }).click();
  await expect(page.getByText("Your Mumble log now shows a pairing code.")).toBeVisible();
  const code = page.getByRole("textbox", { name: "Pairing code" });
  await code.fill("111 111");
  await page.getByRole("button", { name: "Pair", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("The code is not correct. Check it in the Mumble log.");
  await code.fill("123 456");
  await page.getByRole("button", { name: "Pair", exact: true }).click();
  await expect(currentFloor(page)).toBeVisible();
});

test("talking indicator in the user's own room", async ({ page }) => {
  await page.goto("/?fixture=sample");
  await expect(page.locator(".av.talking")).not.toHaveCount(0, { timeout: 15000 });
});

// status (B, ADR-0018): a free text at the own avatar, 2 hours by default, the last five texts for a quick choice
test.describe("Status (B)", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=sample&talking=0"));

  test("others' status shows as a bubble with its text", async ({ page }) => {
    await expect(page.getByRole("img", { name: /^Clara, .*Status: Focus time, please write$/ })).toBeVisible();
    await expect(page.locator(".bubble[title='Status: Focus time, please write']")).toBeVisible();
  });

  test("a small plug marks who does not use Ruumble (no plugin connected)", async ({ page }) => {
    await expect(page.getByRole("img", { name: /^David, .*without Ruumble \(Mumble only\)/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /^Clara/ })).not.toHaveAccessibleName(/without Ruumble/);
    await expect(page.getByRole("img", { name: /^Clara/ }).locator(".plain")).toHaveCount(0);
    await expect(page.getByRole("img", { name: /^David/ }).locator(".plain")).toHaveAttribute("title", "Without Ruumble (Mumble only)");
  });

  test("set with the default expiry, quick choice from the recent ones, clear", async ({ page }) => {
    const button = page.getByRole("button", { name: "My status" });
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await button.click();
    const dialog = page.getByRole("dialog", { name: "My status" });
    await expect(dialog.getByLabel("Expires")).toHaveValue("120");
    await expect(dialog.getByRole("listitem")).toHaveCount(3);
    await dialog.getByLabel("Status", { exact: true }).fill("Reviewing the release");
    await dialog.getByRole("button", { name: "Set status" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(button).toHaveAttribute("title", "My status: Reviewing the release");
    await expect(page.getByRole("img", { name: /^Anna \(you\), .*Status: Reviewing the release \(until \d\d:\d\d\)$/ })).toBeVisible();

    await button.click();
    await expect(dialog.getByText("Current")).toBeVisible();
    await expect(dialog.getByLabel("Status", { exact: true })).toHaveValue("Reviewing the release");
    await expect(dialog.getByRole("listitem").first()).toHaveText("Reviewing the release");
    await dialog.getByRole("button", { name: 'Use "Lunch break"' }).click();
    await expect(dialog.getByLabel("Status", { exact: true })).toHaveValue("Lunch break");
    await dialog.getByLabel("Expires").selectOption({ label: "never" });
    await dialog.getByLabel("Status", { exact: true }).press("Enter");
    await expect(page.getByRole("img", { name: /^Anna \(you\), .*Status: Lunch break$/ })).toBeVisible();

    await button.click();
    await dialog.getByRole("button", { name: "Clear status" }).click();
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("img", { name: /^Anna \(you\)/ }).first()).not.toHaveAccessibleName(/Status/);
  });
});

// building overview (ADR-0019): the cross-section and the directory board, from the elevator's status bar or with H
test.describe("Building overview", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=sample&talking=0"));

  test("opens from the elevator's status bar: every floor, everyone with their place and status", async ({ page }) => {
    await (await elevator(page)).getByRole("button", { name: /8 online/ }).click();
    const dialog = page.getByRole("dialog", { name: "Building overview" });
    await expect(dialog.getByText("8 people in the building")).toBeVisible();
    const board = dialog.getByRole("region", { name: "Directory" });
    await expect(board.getByRole("button", { name: "Go to Gregor (Office 1)" })).toBeVisible();
    await expect(board.getByText("Back at 2 pm")).toBeVisible();
    await expect(board.getByRole("button", { name: /^Anna \(you\).* – Let's talk$/ })).toHaveAttribute("aria-disabled", "true");
    const section = dialog.getByRole("region", { name: "Cross-section" });
    await expect(section.getByRole("img", { name: /^Clara, .*Status: Focus time, please write$/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("H opens it; the search filters, Enter goes to the first match", async ({ page }) => {
    await page.keyboard.press("h");
    const dialog = page.getByRole("dialog", { name: "Building overview" });
    const search = dialog.getByRole("searchbox", { name: "Search the directory" });
    await expect(search).toBeFocused();
    await search.fill("office 3");
    await expect(dialog.getByRole("region", { name: "Directory" }).getByRole("button", { name: /^Go to/ })).toHaveCount(1);
    await search.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status", { name: /^You are here: Office 3/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Support" })).toBeVisible();
  });

  test("a room in the cross-section moves there, a floor badge shows that floor", async ({ page }) => {
    await page.keyboard.press("h");
    const dialog = page.getByRole("dialog", { name: "Building overview" });
    await dialog.getByRole("button", { name: "View the floor Support" }).first().click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Support" })).toBeVisible();
    await page.keyboard.press("h");
    await dialog.getByRole("region", { name: "Cross-section" }).getByRole("button", { name: "Enter Retrospective" }).click();
    await expect(page.getByRole("status", { name: /^You are here: Retrospective/ })).toBeVisible();
  });
});
