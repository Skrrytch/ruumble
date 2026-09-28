import { expect, test } from "@playwright/test";

test.describe("Pinnwand (AP11.2)", () => {
  test.beforeEach(async ({ page }) => page.goto("/?fixture=musterhaus&talking=0"));

  test("zu Beginn ausgeblendet, Zettel im eigenen Raum blenden ein und aus", async ({ page }) => {
    await expect(page.getByRole("complementary", { name: "Pinnwand" })).toHaveCount(0);
    const toggle = page.getByRole("button", { name: "Pinnwand einblenden" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    const board = page.getByRole("complementary", { name: "Pinnwand" });
    await expect(board.getByRole("heading", { name: "Büro von Anna" })).toBeVisible();
    await expect(board.getByText("4 Beiträge")).toBeVisible();
    await page.getByRole("button", { name: "Pinnwand ausblenden" }).first().click();
    await expect(board).toHaveCount(0);
  });

  test("fremde Räume zeigen keine Zettel, auch wenn dort etwas hängt", async ({ page }) => {
    await expect(page.locator('.wrap:has(.room[data-channel="5"]) .notes')).toHaveCount(0); // Clara, mit Beiträgen
    await expect(page.locator("svg.notes")).toHaveCount(1); // nur der Schalter im eigenen Raum
  });

  test("Karten: Code hervorgehoben, lange Texte gekürzt, Popup zeigt alles und speichert Änderungen", async ({ page }) => {
    await page.getByRole("button", { name: "Pinnwand einblenden" }).click();
    const board = page.getByRole("complementary", { name: "Pinnwand" });
    await expect(board.locator(".hljs-keyword").first()).toBeVisible();
    const notes = board.getByRole("article", { name: "Beitrag von Anna" });
    await expect(notes.locator(".body.clamped")).toHaveCount(1);
    await expect(notes.getByText("zuletzt bearbeitet von Ben")).toBeVisible();
    await notes.getByRole("button", { name: "Öffnen · bearbeiten" }).click();
    const dialog = page.getByRole("dialog", { name: "Beitrag von Anna" });
    await expect(dialog.getByText("Punkt vier")).toBeVisible();
    await dialog.getByRole("button", { name: "Bearbeiten" }).click();
    await dialog.getByRole("textbox", { name: "Beitrag bearbeiten" }).fill("Neu **fett**");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog.locator("strong", { hasText: "fett" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(notes.getByText("zuletzt bearbeitet von Anna")).toBeVisible();
  });

  test("Code: Vorschau ohne Zeilennummern, Popup mit", async ({ page }) => {
    await page.getByRole("button", { name: "Pinnwand einblenden" }).click();
    const code = page.getByRole("complementary", { name: "Pinnwand" }).getByRole("article", { name: "Beitrag von Ben" }).filter({ has: page.locator(".hljs") });
    await expect(code.locator(".hljs")).toBeVisible();
    await expect(code.locator(".gutter")).toHaveCount(0);
    await code.getByRole("button", { name: "Öffnen · bearbeiten" }).click();
    await expect(page.getByRole("dialog").locator(".gutter")).toBeVisible();
  });

  test("anheften mit Strg+Enter, filtern, löschen", async ({ page }) => {
    await page.getByRole("button", { name: "Pinnwand einblenden" }).click();
    const board = page.getByRole("complementary", { name: "Pinnwand" });
    const input = board.getByRole("textbox", { name: "Neuer Beitrag" });
    await input.fill("Kurzer **Hinweis**");
    await input.press("Control+Enter");
    await expect(board.getByText("5 Beiträge")).toBeVisible();
    await expect(board.getByRole("article").first().locator("strong", { hasText: "Hinweis" })).toBeVisible();
    await expect(input).toHaveValue("");
    await board.getByRole("button", { name: "Code", exact: true }).click();
    await expect(board.getByRole("article")).toHaveCount(1);
    await board.getByRole("button", { name: "Alle" }).click();
    // eigenen Beitrag löschen
    page.once("dialog", (d) => d.accept());
    await board.getByRole("article").first().getByRole("button", { name: "Öffnen · bearbeiten" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await expect(board.getByText("4 Beiträge")).toBeVisible();
  });

  test("eingefügter Code: Vorschlag „als Code anheften“", async ({ page }) => {
    await page.getByRole("button", { name: "Pinnwand einblenden" }).click();
    const input = page.getByRole("textbox", { name: "Neuer Beitrag" });
    await input.focus();
    await input.evaluate((el) => {
      const data = new DataTransfer();
      data.setData("text/plain", "function f(a) {\n  return a + 1;\n}");
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
    });
    await page.getByRole("status").getByRole("button", { name: "Ja" }).click();
    await expect(page.getByRole("button", { name: "Als Code anheften" })).toHaveAttribute("aria-pressed", "true");
  });

  test("HTML im Beitrag bleibt Text", async ({ page }) => {
    await page.getByRole("button", { name: "Pinnwand einblenden" }).click();
    const board = page.getByRole("complementary", { name: "Pinnwand" });
    await board.getByRole("textbox", { name: "Neuer Beitrag" }).fill('<img src=x onerror="document.title=\'gehackt\'"> [x](javascript:alert(1))');
    await board.getByRole("button", { name: "Senden" }).click();
    await expect(board.getByRole("article").first()).toContainText("<img src=x");
    await expect(board.getByRole("article").first().locator("img")).toHaveCount(0);
    expect(await page.title()).toBe("Ruumble");
  });

  test("im Flur: Hinweis statt Pinnwand", async ({ page }) => {
    await page.getByRole("button", { name: "Pinnwand einblenden" }).click();
    await page.getByRole("button", { name: "Flur ENTWICKLUNG betreten" }).click();
    await expect(page.getByText("Pinnwände gibt es nur in Räumen.")).toBeVisible();
  });
});

test("Etage mit 2 Räumen: je ein Raum oben und unten, die offene Pinnwand wird breiter", async ({ page }) => {
  await page.goto("/?fixture=sonderfaelle&talking=0");
  await page.getByRole("button", { name: /STUDIO/ }).click();
  await page.getByRole("button", { name: "Studio A betreten" }).click();
  const a = page.locator('.room[data-channel="41"]');
  const b = page.locator('.room[data-channel="42"]');
  expect((await b.boundingBox())!.y).toBeGreaterThan((await a.boundingBox())!.y + 200);
  await page.getByRole("button", { name: "Pinnwand einblenden" }).click();
  const board = page.getByRole("complementary", { name: "Pinnwand" });
  await expect(board).toBeVisible();
  expect((await board.boundingBox())!.width).toBeGreaterThan(450);
});

test.describe("Pinnwand: Bilder und Dateien (AP11.3)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?fixture=musterhaus&talking=0");
    await page.getByRole("button", { name: "Pinnwand einblenden" }).click();
  });

  test("Büroklammer: Datei hochladen, mit Beschreibung anheften, Download-Link", async ({ page }) => {
    const board = page.getByRole("complementary", { name: "Pinnwand" });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), board.getByRole("button", { name: "Bild oder Datei anhängen" }).click()]);
    await chooser.setFiles({ name: "bericht.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
    await expect(board.getByText("13 B · bereit")).toBeVisible();
    await expect(board.getByRole("button", { name: "Als Code anheften" })).toBeDisabled();
    await board.getByRole("textbox", { name: "Neuer Beitrag" }).fill("Zum **Lesen**");
    await board.getByRole("button", { name: "Senden" }).click();
    const card = board.getByRole("article").first();
    await expect(card.getByText("bericht.pdf")).toBeVisible();
    await expect(card.locator("strong", { hasText: "Lesen" })).toBeVisible();
    await expect(card.getByRole("link", { name: /bericht\.pdf/ })).toHaveAttribute("download", "bericht.pdf");
    await expect(board.getByText("5 Beiträge")).toBeVisible();
    await board.getByRole("button", { name: "Dateien" }).click();
    await expect(board.getByRole("article")).toHaveCount(2);
  });

  test("Bild einfügen (Strg+V), Vollbild mit Zoom, Esc schließt", async ({ page }) => {
    const input = page.getByRole("textbox", { name: "Neuer Beitrag" });
    await input.evaluate(async (el) => {
      const c = document.createElement("canvas");
      c.width = 400;
      c.height = 200;
      c.getContext("2d")!.fillRect(0, 0, 200, 100);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
      const data = new DataTransfer();
      data.items.add(new File([blob], "image.png", { type: "image/png" }));
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    const board = page.getByRole("complementary", { name: "Pinnwand" });
    await expect(board.getByText(/^bild-\d{4}-\d{2}-\d{2}-\d{4}\.png$/)).toBeVisible();
    await expect(board.getByText(/· bereit$/)).toBeVisible();
    await input.press("Control+Enter");
    const card = board.getByRole("article").first();
    await expect(card.getByText("Bild", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: /groß anzeigen/ }).click();
    const lightbox = page.getByRole("dialog", { name: /^Bild: bild-/ });
    await expect(lightbox.getByText("100 %")).toBeVisible();
    await lightbox.getByRole("button", { name: "Vergrößern" }).click();
    await expect(lightbox.getByText("125 %")).toBeVisible();
    await lightbox.getByRole("button", { name: "Einpassen" }).click();
    await expect(lightbox.getByText("100 %")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(lightbox).toHaveCount(0);
  });

  test("Datei auf die Pinnwand ziehen", async ({ page }) => {
    const board = page.getByRole("complementary", { name: "Pinnwand" });
    const data = await page.evaluateHandle(() => {
      const d = new DataTransfer();
      d.items.add(new File(["a,b\n1,2\n"], "werte.csv", { type: "text/csv" }));
      return d;
    });
    await board.dispatchEvent("dragenter", { dataTransfer: data });
    await expect(board.getByText("Loslassen zum Anheften")).toBeVisible();
    await board.dispatchEvent("drop", { dataTransfer: data });
    await expect(board.getByText("Loslassen zum Anheften")).toHaveCount(0);
    await expect(board.getByText("werte.csv")).toBeVisible();
    await board.getByRole("button", { name: "Senden" }).click();
    await expect(board.getByRole("article").first().getByText("werte.csv")).toBeVisible();
  });

  test("zu große Datei: verständlicher Fehler, nichts wird gesendet", async ({ page }) => {
    const board = page.getByRole("complementary", { name: "Pinnwand" });
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), board.getByRole("button", { name: "Bild oder Datei anhängen" }).click()]);
    await chooser.setFiles({ name: "gross.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
    await expect(board.getByRole("alert")).toHaveText("Die Datei ist zu groß (höchstens 10 MB).");
    await expect(board.getByRole("button", { name: "Senden" })).toBeDisabled();
    await board.getByRole("button", { name: "Anhang entfernen" }).click();
    await expect(board.getByRole("alert")).toHaveCount(0);
  });

  test("Bildunterschrift im Popup bearbeiten", async ({ page }) => {
    const board = page.getByRole("complementary", { name: "Pinnwand" });
    await board.getByRole("article", { name: "Beitrag von Clara" }).getByRole("button", { name: "Öffnen · bearbeiten" }).click();
    const dialog = page.getByRole("dialog", { name: "Beitrag von Clara" });
    await dialog.getByRole("button", { name: "Beschreibung bearbeiten" }).click();
    await dialog.getByRole("textbox", { name: "Bildunterschrift bearbeiten" }).fill("Neue Skizze");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog.getByText("Neue Skizze")).toBeVisible();
  });
});
