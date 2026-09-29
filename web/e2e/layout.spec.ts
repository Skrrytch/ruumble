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

async function boxes(page: Page, attr: "data-join" | "data-channel") {
  return page.evaluate((attr) => {
    const plan = document.querySelector(".plan")!.getBoundingClientRect();
    const rel = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x - plan.x, y: r.y - plan.y, width: r.width, height: r.height };
    };
    const result: Record<string, { x: number; y: number; width: number; height: number }> = {
      plan: { x: 0, y: 0, width: plan.width, height: plan.height },
      core: rel(document.querySelector(".core")!),
      elevator: rel(document.querySelector(".elevator")!),
    };
    for (const el of document.querySelectorAll(`.room[${attr}]`)) result[`room-${el.getAttribute(attr)}`] = rel(el);
    for (const el of document.querySelectorAll(".floor[data-floor]")) result[`floor-${el.getAttribute("data-floor")}`] = rel(el);
    return result;
  }, attr);
}

test("Layout entspricht dem Prototyp (Musterhaus, Etage ENTWICKLUNG)", async ({ page }, info) => {
  await page.goto(PROTOTYPE);
  const reference = await boxes(page, "data-join");
  await page.screenshot({ path: info.outputPath("prototyp.png") });

  await page.goto("/?fixture=musterhaus&talking=0");
  await expect(page.getByRole("heading", { name: "ENTWICKLUNG" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // The title bar is more compact than in the prototype and the floor plan fills the height: shrink the window
  // until the floor plan is as tall as in the prototype, then compare
  const first = await boxes(page, "data-channel");
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: Math.round(size.height - (first.plan!.height - reference.plan!.height)) });
  const ours = await boxes(page, "data-channel");
  await page.screenshot({ path: info.outputPath("ruumble.png") });

  const deviations: string[] = [];
  for (const [key, ref] of Object.entries(reference) as [string, Box][]) {
    const box = ours[key] as Box | undefined;
    if (!box) { deviations.push(`${key}: fehlt`); continue; }
    // Floor buttons are deliberately more compact than in the prototype (room for more floors and the entrance):
    // for them only x and width, for the elevator panel everything except the height
    // Since the floor layout, room widths follow the Mumble order (rooms 1 and 2 large), no longer the name
    // as in the prototype: for rooms therefore only row (y) and height
    const keys = key.startsWith("floor-")
      ? (["x", "width"] as const)
      : key.startsWith("room-") && key !== "room-2"
        ? (["y", "height"] as const)
      : key === "elevator"
        ? (["x", "y", "width"] as const)
        : (["x", "y", "width", "height"] as const);
    for (const k of keys) {
      if (Math.abs(box[k] - ref[k]) > TOLERANCE) deviations.push(`${key}.${k}: ${box[k].toFixed(1)} statt ${ref[k].toFixed(1)}`);
    }
  }
  expect(deviations, deviations.join("\n")).toEqual([]);
  expect(Object.keys(ours).sort()).toEqual(Object.keys(reference).sort());
});
