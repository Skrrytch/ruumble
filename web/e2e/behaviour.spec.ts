import { expect, test } from "@playwright/test";

test.describe("Musterhaus", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=sample&talking=0"));

  test("Start auf der eigenen Etage, eigener Raum markiert", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Development" })).toBeVisible();
    await expect(page.getByLabel("4 auf dieser Etage")).toBeVisible();
    await expect(page.getByText("8 online", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Let's talk – du bist hier" })).toBeVisible();
    await expect(page.getByRole("button", { name: "1. Obergeschoss: Development" })).toHaveAttribute("aria-current", "page");
  });

  test("Öffnung vom Aufzugskern zum Flur liegt genau am Flur, auch bei anderer Fensterhöhe", async ({ page }) => {
    for (const height of [900, 760, 1100]) {
      await page.setViewportSize({ width: 1440, height });
      const opening = (await page.locator(".opening").boundingBox())!;
      const corridor = (await page.locator('.room.corridor').boundingBox())!;
      expect(Math.abs(opening.y - corridor.y)).toBeLessThan(1);
      expect(Math.abs(opening.height - corridor.height)).toBeLessThan(1);
    }
  });

  test("Klick auf einen Raum wechselt erst nach Bestätigung", async ({ page }) => {
    await page.getByRole("button", { name: "Clara's office betreten" }).click();
    await expect(page.getByRole("button", { name: "Clara's office – wird betreten" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Clara's office – du bist hier" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Let's talk betreten" })).toBeVisible();
    await page.getByRole("button", { name: "Flur Development betreten" }).click();
    await expect(page.getByRole("button", { name: "Flur Development – du bist hier" })).toBeVisible();
  });

  test("Etagentaste wechselt nur die Ansicht, „Zu meiner Etage“ zurück", async ({ page }) => {
    await page.getByRole("button", { name: "Erdgeschoss: Lobby" }).click();
    await expect(page.getByRole("heading", { name: "Lobby" })).toBeVisible();
    await expect(page.getByText("Offene Etage ohne Büros · 2 Personen")).toBeVisible();
    await page.getByRole("button", { name: "Zu meiner Etage" }).click();
    await expect(page.getByRole("heading", { name: "Development" })).toBeVisible();
  });

  test("Stumm und Taub mit der Semantik von Mumble", async ({ page }) => {
    const mute = page.getByRole("button", { name: "Mikrofon stummschalten" });
    const deaf = page.getByRole("button", { name: "Taub schalten" });
    await deaf.click();
    await expect(deaf).toHaveAttribute("aria-pressed", "true");
    await expect(mute).toHaveAttribute("aria-pressed", "true");
    await mute.click(); // unmute also lifts deaf
    await expect(mute).toHaveAttribute("aria-pressed", "false");
    await expect(deaf).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("img", { name: "Anna (du)" })).toBeVisible();
  });
});

test.describe("Sonderfälle", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=edge-cases&talking=0"));

  test("gesperrte Etagen sind sichtbar, aber nicht wählbar", async ({ page }) => {
    const archive = page.getByRole("button", { name: "3. Obergeschoss: ARCHIVE – gesperrt: Kanalstruktur zu tief" });
    await expect(archive).toHaveAttribute("aria-disabled", "true");
    await archive.click({ force: true }); // aria-disabled: otherwise Playwright does not click at all
    await expect(page.getByRole("heading", { name: "DEVELOPMENT" })).toBeVisible();
    await expect(page.getByRole("button", { name: "4. Obergeschoss: OPEN SPACE – gesperrt: Zu viele Räume" })).toBeVisible();
    await expect(page.getByRole("button", { name: /EXTERNAL|PARTNERS/ })).toHaveCount(0);
  });

  test("Eingang, Schloss, Mitlauschen, Status-Symbole", async ({ page }) => {
    await expect(page.getByRole("region", { name: "Eingang" }).getByRole("img")).toHaveCount(2);
    await expect(page.getByTitle("1 Person hört mit")).toBeVisible();
    await expect(page.getByRole("img", { name: "Nils, vom Server stummgeschaltet" })).toBeVisible();
    await expect(page.getByTitle("Vom Server stummgeschaltet", { exact: true })).toHaveCount(2); // Nils (suppressed), Mia (server mute)
    await page.getByRole("button", { name: "Erdgeschoss: Lobby" }).click();
    await expect(page.locator(".floorplan").getByTitle("Stumm", { exact: true })).toHaveCount(1); // Ben
    await expect(page.locator(".floorplan").getByTitle("Taub", { exact: true })).toHaveCount(1); // Felix
    await page.getByRole("button", { name: "Zu meiner Etage" }).click();
    await page.getByRole("button", { name: "2. Obergeschoss: SALES" }).click();
    const locked = page.getByRole("button", { name: "Gregor's office – kein Zutritt" });
    await expect(locked).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByRole("button", { name: /Kitchen|Coffee corner/ })).toHaveCount(0);
  });
});

test("gesperrter Raum: Klick bewirkt nichts", async ({ page }) => {
  await page.goto("/?fixture=edge-cases&talking=0");
  await page.getByRole("button", { name: "2. Obergeschoss: SALES" }).click();
  await page.getByRole("button", { name: "Gregor's office – kein Zutritt" }).click({ force: true });
  await expect(page.getByRole("button", { name: "Gregor's office – kein Zutritt" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("unbestätigter Wechsel zeigt nach 3 s einen Hinweis, der Nutzer bleibt im Raum", async ({ page }) => {
  await page.goto("/?fixture=sample&talking=0&debug");
  await page.getByRole("button", { name: "Reject next move" }).click();
  await page.getByRole("button", { name: "Ben's office betreten" }).click();
  await expect(page.getByRole("button", { name: "Ben's office – wird betreten" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText(/Wechsel nach „Ben's office“ nicht möglich/, { timeout: 6000 });
  await expect(page.getByRole("button", { name: "Let's talk – du bist hier" })).toBeVisible();
});

test("schnelle Klicks: der letzte Raum gewinnt", async ({ page }) => {
  await page.goto("/?fixture=sample&talking=0");
  for (const name of ["Let's play", "Retrospective", "Clara's office"]) await page.getByRole("button", { name: `${name} betreten` }).click();
  await expect(page.getByRole("button", { name: "Clara's office – du bist hier" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Unterkanal anlegen sperrt die eigene Etage live", async ({ page }) => {
  await page.goto("/?fixture=sample&talking=0&debug");
  await page.getByRole("button", { name: "Add subchannel in the first room" }).click();
  await expect(page.getByText("Du bist in einem Bereich, der hier nicht darstellbar ist.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Development – gesperrt/ })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Remove new subchannels" }).click();
  await expect(page.getByRole("button", { name: "Let's talk – du bist hier" })).toBeVisible();
});

test("Avatare, Anwesenheit und Aufnahme (AP9/AP10)", async ({ page }) => {
  await page.goto("/?fixture=edge-cases&talking=0");
  await expect(page.locator(".floorplan img").first()).toBeVisible(); // Anna's avatar (mock SVG)
  await page.getByRole("button", { name: "Erdgeschoss: Lobby" }).click();
  await expect(page.getByRole("img", { name: "Ben, stumm, seit 20 Min. still" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Felix, taub, abwesend" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Eva, zeichnet auf" })).toBeVisible();
  await expect(page.getByText("● Aufnahme")).toBeVisible();
});

test("defektes Avatarbild: Initialen statt Bild", async ({ page }) => {
  await page.route("**/*", (route) => route.continue());
  await page.goto("/?fixture=edge-cases&talking=0");
  await page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>(".floorplan img");
    if (img) img.src = "/gibt-es-nicht.png";
  });
  await expect(page.locator(".floorplan img")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Anna (du)" })).toContainText("An");
});

test("Leerstand", async ({ page }) => {
  await page.goto("/?fixture=vacant&talking=0");
  await expect(page.getByRole("heading", { name: "Leerstand" })).toBeVisible();
  await expect(page.getByText("Keine Etage dieses Gebäudes lässt sich darstellen", { exact: false })).toBeVisible();
});

test("ohne gekoppeltes Plugin: Hinweis statt Gebäude", async ({ page }) => {
  await page.goto("/?fixture=unpaired&talking=0");
  await expect(page.getByText("Mumble ist nicht verbunden.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Aufzug – Etagen" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ruumble-Plugin herunterladen" })).toHaveAttribute("href", "/download");
});

test("Sprechanzeige im eigenen Raum", async ({ page }) => {
  await page.goto("/?fixture=sample");
  await expect(page.locator(".av.talking")).not.toHaveCount(0, { timeout: 15000 });
});
