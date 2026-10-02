import type { Locator, Page } from "@playwright/test";

/** The top bar's current floor, which opens the elevator (English or German) */
export const currentFloor = (page: Page): Locator => page.getByRole("button", { name: /(choose floor|Etage wählen)$/ });

/** opens the elevator dropdown (if it is not open yet) and returns it */
export async function elevator(page: Page): Promise<Locator> {
  const button = currentFloor(page);
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  return page.getByRole("navigation", { name: /Elevator – floors|Aufzug – Etagen/ });
}

/** picks a floor in the elevator */
export async function gotoFloor(page: Page, name: string | RegExp): Promise<void> {
  await (await elevator(page)).getByRole("button", { name }).click();
}

/** opens the user menu (if it is not open yet) and returns it */
export async function userMenu(page: Page): Promise<Locator> {
  const button = page.getByRole("button", { name: /^(User menu|Benutzermenü)$/ });
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  return page.getByRole("group", { name: /^(User menu|Benutzermenü)$/ });
}
