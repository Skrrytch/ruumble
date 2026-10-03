/**
 * Comparison with the reference prototype (docs/design/prototype/index.html) at 1440 × 900.
 * The font is deliberately different (Inter instead of the original font), so the layout is compared
 * via the DOM (position and size relative to the floor plan) instead of pixel by pixel. Screenshots of both pages
 * end up in test-results/ for visual inspection.
 */
import { expect, test, type Page } from "@playwright/test";

const PROTOTYPE = new URL("../../docs/design/prototype/index.html", import.meta.url).href;
const TOLERANCE = 3;

type Box = { x: number; y: number; width: number; height: number };

/** Building of the prototype (docs/design/prototype/index.html): same IDs, positions and occupancy, names translated */
const PROTOTYPE_SNAPSHOT = (() => {
  const ch = (id: number, parent: number | null, name: string, position: number) => ({ id, parent, name, position, links: [], temporary: false });
  const user = (session: number, name: string, channel: number) => ({
    session, name, channel, selfMute: false, selfDeaf: false, mute: false, deaf: false, suppress: false,
    userId: session === 4 ? 1 : null, avatar: null, idleMinutes: 0, recording: false,
  });
  const offices = ["Anna", "Ben", "Clara", "David", "Eva", "Felix"].map((n, i) => ch(3 + i, 2, `${n}'s office`, i));
  const sales = ["Away", "Focus room (muted)", "Kitchen", "Coffee corner", "Gregor's office", "Project room"].map((n, i) => ch(10 + i, 9, n, i));
  return {
    v: 1, type: "snapshot", server: { name: "Acme HQ", version: "1.6.870" }, self: { session: 4 },
    channels: [ch(0, null, "Acme HQ", 0), ch(1, 0, "Lobby", 0), ch(2, 0, "DEVELOPMENT", 1), ...offices, ch(9, 0, "SALES", 2), ...sales],
    users: [user(1, "Ben", 1), user(2, "Felix", 1), user(3, "Eva", 1), user(4, "Anna", 3), user(5, "Gregor", 12), user(6, "Hanna", 12)],
    listeners: {}, canEnter: {},
  };
})();

async function boxes(page: Page, attr: "data-join" | "data-channel") {
  return page.evaluate((attr) => {
    const plan = document.querySelector(".plan")!.getBoundingClientRect();
    const rel = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x - plan.x, y: r.y - plan.y, width: r.width, height: r.height };
    };
    const result: Record<string, { x: number; y: number; width: number; height: number }> = {
      plan: { x: 0, y: 0, width: plan.width, height: plan.height },
    };
    for (const el of document.querySelectorAll(`.room[${attr}]`)) result[`room-${el.getAttribute(attr)}`] = rel(el);
    return result;
  }, attr);
}

test("layout matches the prototype (sample building, DEVELOPMENT floor)", async ({ page }, info) => {
  await page.goto(PROTOTYPE);
  const reference = await boxes(page, "data-join");
  await page.screenshot({ path: info.outputPath("prototype.png") });

  // The sample building no longer matches the prototype: the service is simulated and sends its layout
  await page.routeWebSocket("**/ws/ui", (ws) => {
    ws.send(JSON.stringify({ v: 1, type: "status", plugin: "connected" }));
    ws.send(JSON.stringify(PROTOTYPE_SNAPSHOT));
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "DEVELOPMENT" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // The title bar is more compact than in the prototype and the floor plan fills the height: shrink the window
  // until the floor plan is as tall as in the prototype, then compare
  const first = await boxes(page, "data-channel");
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: Math.round(size.height - (first.plan!.height - reference.plan!.height)) });
  const ours = await boxes(page, "data-channel");
  await page.screenshot({ path: info.outputPath("ruumble.png") });

  const deviations: string[] = [];
  for (const [key, ref] of (Object.entries(reference) as [string, Box][]).filter(([key]) => key.startsWith("room-"))) {
    const box = ours[key] as Box | undefined;
    if (!box) { deviations.push(`${key}: missing`); continue; }
    // The elevator column of the prototype became the top bar (2026-10-02) and room widths follow the number
    // of people (E31): what is left to compare are the rows and the corridor, i.e. y and height of every room
    const keys = ["y", "height"] as const;
    for (const k of keys) {
      if (Math.abs(box[k] - ref[k]) > TOLERANCE) deviations.push(`${key}.${k}: ${box[k].toFixed(1)} instead of ${ref[k].toFixed(1)}`);
    }
  }
  expect(deviations, deviations.join("\n")).toEqual([]);
  const rooms = (boxes: Record<string, unknown>) => Object.keys(boxes).filter((k) => k.startsWith("room-")).sort();
  expect(rooms(ours)).toEqual(rooms(reference));
});

test("width: scales down to 1000 px, a wider window is used in full, the open board grows beyond 1440 px", async ({ page }) => {
  await page.goto("/?fixture=sample&talking=0");
  const width = async (selector: string) => (await page.locator(selector).boundingBox())!.width;
  for (const [window, board] of [[1000, 340], [1280, 340], [1440, 340], [1920, 340 + 240], [2560, 340 + 560]] as const) {
    await page.setViewportSize({ width: window, height: 900 });
    expect(await width(".app")).toBeCloseTo(window, 0);
    await page.getByRole("button", { name: "Show board" }).click();
    expect(await width(".board")).toBeCloseTo(board, 0);
    await page.getByRole("button", { name: "Hide board" }).first().click();
  }
  // narrower than the minimum: the app keeps its width and the page scrolls
  await page.setViewportSize({ width: 900, height: 900 });
  expect(await width(".app")).toBeCloseTo(1000, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeGreaterThan(900);
});

test("height: rooms keep room for two rows of people, a lower window scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.goto("/?fixture=sample&talking=0");
  const box = async (selector: string) => (await page.locator(selector).first().boundingBox())!;
  const person = (await box(".person")).height;
  // far wall 12, two rows of people with 6 between, 8, the door strip (48) with door, plant, board and door plate
  expect(person).toBe(63);
  for (const row of ["top", "bottom"]) expect((await box(`.row.${row} .room`)).height).toBeGreaterThanOrEqual(12 + 2 * person + 6 + 8 + 48 - 1);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(600);
  // a tall window is used in full
  await page.setViewportSize({ width: 1000, height: 1000 });
  expect((await box(".app")).height).toBeCloseTo(1000, 0);
});
