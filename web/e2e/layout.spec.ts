/**
 * Vergleich mit dem Referenzprototyp (docs/design/prototype/index.html) bei 1440 × 900.
 * Die Schrift ist bewusst eine andere (Inter statt der Originalschrift), deshalb wird das Layout per DOM
 * verglichen (Lage und Größe relativ zum Grundriss) statt Pixel für Pixel. Screenshots beider Seiten
 * landen zur Sichtprüfung in test-results/.
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
  const ours = await boxes(page, "data-channel");
  await page.screenshot({ path: info.outputPath("ruumble.png") });

  const deviations: string[] = [];
  for (const [key, ref] of Object.entries(reference) as [string, Box][]) {
    const box = ours[key] as Box | undefined;
    if (!box) { deviations.push(`${key}: fehlt`); continue; }
    // Etagentasten sind bewusst kompakter als im Prototyp (Platz für mehr Etagen und den Eingang):
    // bei ihnen nur x und Breite, beim Aufzug-Panel alles außer der Höhe
    // Raumbreiten folgen seit dem Etagen-Layout der Mumble-Reihenfolge (Raum 1 und 2 groß), nicht mehr dem Namen
    // wie im Prototyp: bei Räumen deshalb nur Zeile (y) und Höhe
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
