/**
 * Live-Test: echter Mumble-Server (v1.6.870), Ruumble-Dienst im Container und headless Mumble-Clients mit dem
 * echten Ruumble-Plugin. Die Oberfläche steuert Annas Mumble-Client; geprüft wird, was der Server zurückmeldet.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loadBot, registerUser, serverVersion, solidPng, unregisterUser } from "./mumble-admin.ts";

const root = new URL("../../", import.meta.url).pathname;
/** `bridgeUrl = ""`: ohne feste Adresse, das Plugin liest sie aus der Root-Beschreibung (ADR-0010) */
const runClient = (distro: string, name: string, bridgeUrl = "http://ruumble:8080") =>
  execFileSync(`${root}deploy/local/run-client.sh`, [distro, name], { env: { ...process.env, BRIDGE_URL: bridgeUrl } });
/** Root-Beschreibung setzen (Testvorbereitung mit Write-Secret); `long`: über 128 Zeichen → Mumble schickt nur einen Hash */
const setRootDescription = (long: boolean) =>
  execFileSync("node", ["src/setup.cjs"], { cwd: `${root}spikes/s1-ice`, env: { ...process.env, RUUMBLE_DESC_PAD: long ? "1" : "" } });
const stopClient = (name: string) => execFileSync("docker", ["rm", "-f", `ruumble-client-${name}`]);

/** Mumble-Protokoll eines Test-Clients (das Plugin spiegelt es mit RUUMBLE_LOG_STDERR auf stderr) */
const mumbleLog = (name: string) => {
  const file = `${root}deploy/local/out/${name}/mumble.log`;
  return existsSync(file) ? readFileSync(file, "utf8") : "";
};

async function pairUrl(name: string): Promise<string> {
  const file = `${root}deploy/local/out/${name}/pair-url.txt`;
  for (let i = 0; i < 120 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 250));
  return readFileSync(file, "utf8").trim();
}

const distro = process.env.RUUMBLE_CLIENT ?? "ubuntu";
const frames: string[] = [];

test.describe.serial(`Live mit Mumble-Client (${distro})`, () => {
  let page: Page;
  let ben: BrowserContext | null = null;
  let benPage: Page;

  test.beforeAll(async ({ browser }) => {
    runClient(distro, "Anna");
    page = await browser.newPage();
    // Diagnose: alle Nachrichten an Annas Oberfläche (außer Snapshots) festhalten
    page.on("websocket", (ws) => ws.on("framereceived", (f) => {
      const text = String(f.payload);
      if (!text.includes('"snapshot"')) frames.push(`${Date.now()} ${text}`);
    }));
  });

  test.afterEach(async ({}, info) => {
    if (info.status !== info.expectedStatus) writeFileSync(info.outputPath("ws-frames.txt"), frames.join("\n"));
  });

  test.afterAll(async () => {
    await ben?.close();
    await unregisterUser("Robo").catch(() => {});
    stopClient("Anna");
    try { stopClient("Ben"); } catch { /* nicht gestartet */ }
  });

  test("Kopplungslink des Plugins koppelt den Browser", async () => {
    const url = await pairUrl("Anna");
    expect(url).toMatch(/\/pair\?code=/);
    await page.goto(url);
    await expect(page).toHaveURL("http://127.0.0.1:8080/");
    await expect(page.getByRole("navigation", { name: "Aufzug – Etagen" })).toBeVisible();
    // frisch verbunden steht Anna im Root-Kanal: Eingang
    await expect(page.getByRole("region", { name: "Eingang" }).getByRole("img", { name: /Anna \(du\)/ })).toBeVisible();
    // derselbe Link ein zweites Mal: ungültig
    const again = await page.request.get(url, { maxRedirects: 0 });
    expect(again.status()).toBe(400);
  });

  test("Klick auf einen Raum verschiebt den echten Mumble-Client", async () => {
    await page.getByRole("button", { name: "1. Obergeschoss: ENTWICKLUNG" }).click();
    await page.getByRole("button", { name: "Büro von Anna betreten" }).click();
    await expect(page.getByRole("button", { name: "Büro von Anna – du bist hier" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Flur ENTWICKLUNG betreten" }).click();
    await expect(page.getByRole("button", { name: "Flur ENTWICKLUNG – du bist hier" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Büro von Anna betreten" }).click();
    await expect(page.getByRole("button", { name: "Büro von Anna – du bist hier" })).toBeVisible({ timeout: 5000 });
  });

  test("Pinnwand: im eigenen Raum ist der Schalter da, anheften geht über den echten Dienst", async () => {
    const toggle = page.getByRole("button", { name: "Pinnwand einblenden" });
    await expect(toggle).toBeVisible();
    await toggle.click();
    const board = page.getByRole("complementary", { name: "Pinnwand" });
    await expect(board.getByRole("heading", { name: "Büro von Anna" })).toBeVisible();
    await board.getByRole("textbox", { name: "Neuer Beitrag" }).fill("Live **Test**");
    await board.getByRole("button", { name: "Senden" }).click();
    await expect(board.getByRole("article").first().locator("strong", { hasText: "Test" })).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await board.getByRole("article").first().getByRole("button", { name: "Öffnen · bearbeiten" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
    await expect(board.getByText("Noch keine Beiträge")).toBeVisible();
    await page.getByRole("button", { name: "Pinnwand ausblenden" }).first().click();
  });

  test("Sprechanzeige kommt vom echten Client", async () => {
    await expect(page.locator(".av.me.talking")).toBeVisible({ timeout: 10_000 });
  });

  test("Stumm und Taub schalten den echten Client", async () => {
    const mute = page.getByRole("button", { name: "Mikrofon stummschalten" });
    const deaf = page.getByRole("button", { name: "Taub schalten" });
    await mute.click();
    await expect(mute).toHaveAttribute("aria-pressed", "true", { timeout: 5000 });
    await expect(page.getByRole("img", { name: "Anna (du), stumm" })).toBeVisible();
    await deaf.click();
    await expect(deaf).toHaveAttribute("aria-pressed", "true", { timeout: 5000 });
    await expect(page.getByRole("img", { name: "Anna (du), taub" })).toBeVisible();
    await mute.click(); // Unmute hebt Taub mit auf (Mumble-Semantik)
    await expect(deaf).toHaveAttribute("aria-pressed", "false", { timeout: 5000 });
    await expect(mute).toHaveAttribute("aria-pressed", "false");
  });

  test("Zutrittsrecht aus Mumble: Gregors Büro ist gesperrt", async () => {
    await page.getByRole("button", { name: "2. Obergeschoss: VERTRIEB" }).click();
    await expect(page.getByRole("button", { name: "Gregors Büro – kein Zutritt" })).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Zu meiner Etage" }).click();
  });

  test("zweiter Client im selben Raum: sichtbar und hörbar", async () => {
    runClient(distro, "Ben");
    const benUrl = await pairUrl("Ben");
    ben = await page.context().browser()!.newContext();
    benPage = await ben.newPage();
    await benPage.goto(benUrl);
    await expect(benPage.getByRole("region", { name: "Eingang" }).getByRole("img", { name: /Ben \(du\)/ })).toBeVisible({ timeout: 10_000 });
    await benPage.getByRole("button", { name: "1. Obergeschoss: ENTWICKLUNG" }).click();
    await benPage.getByRole("button", { name: "Büro von Anna betreten" }).click();
    await expect(benPage.getByRole("button", { name: "Büro von Anna – du bist hier" })).toBeVisible({ timeout: 5000 });
    // Annas Oberfläche: Ben sitzt bei ihr und spricht (Annas Client hört ihn)
    await expect(page.getByRole("img", { name: /^Ben/ })).toBeVisible({ timeout: 5000 });
    // Bens headless Client sendet den Sinuston in Schüben (~250 ms „talking“ alle ~2 s), deshalb eng abfragen:
    // Der Ring muss mindestens einmal erscheinen.
    await page.waitForFunction(
      () => [...document.querySelectorAll('[role="img"]')].some((e) => e.getAttribute("aria-label") === "Ben, spricht"),
      null,
      { polling: 50, timeout: 10_000 },
    );
  });

  test("Pinnwand zu zweit: Beitrag erscheint beim anderen, Hinweis in seinem Mumble-Protokoll (AP11.4)", async () => {
    await page.getByRole("button", { name: "Pinnwand einblenden" }).click();
    await benPage.getByRole("button", { name: "Pinnwand einblenden" }).click();
    const annaBoard = page.getByRole("complementary", { name: "Pinnwand" });
    const benBoard = benPage.getByRole("complementary", { name: "Pinnwand" });
    await expect(benBoard.getByRole("heading", { name: "Büro von Anna" })).toBeVisible();
    // Anna heftet Code an: Ben sieht ihn ohne Neuladen, sein Mumble meldet es, Annas nicht
    await annaBoard.getByRole("button", { name: "Als Code anheften" }).click();
    await annaBoard.getByRole("textbox", { name: "Neuer Beitrag" }).fill("const live = true;\nconsole.log(live);");
    await annaBoard.getByRole("button", { name: "Senden" }).click();
    await expect(benBoard.getByRole("article", { name: "Beitrag von Anna" }).locator(".hljs")).toBeVisible({ timeout: 5000 });
    await expect.poll(() => mumbleLog("Ben"), { timeout: 5000 }).toContain("ruumble-log: Anna hat Code an die Pinnwand geheftet.");
    expect(mumbleLog("Anna")).not.toContain("an die Pinnwand geheftet");
    // Ben lädt ein echtes Bild hoch (XMLHttpRequest mit Fortschritt, Bytes-Prüfung im Dienst)
    const [chooser] = await Promise.all([benPage.waitForEvent("filechooser"), benBoard.getByRole("button", { name: "Bild oder Datei anhängen" }).click()]);
    await chooser.setFiles({ name: "punkt.png", mimeType: "image/png", buffer: Buffer.from(solidPng(40, [0, 120, 190])) });
    await expect(benBoard.getByText(/· bereit$/)).toBeVisible({ timeout: 5000 });
    await benBoard.getByRole("button", { name: "Senden" }).click();
    const image = annaBoard.getByRole("article", { name: "Beitrag von Ben" }).locator("img");
    await expect(image).toBeVisible({ timeout: 5000 });
    expect(await image.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(40);
    await expect.poll(() => mumbleLog("Anna"), { timeout: 5000 }).toContain("ruumble-log: Ben hat ein Bild an die Pinnwand geheftet.");
    // aufräumen und Rechte: Ben löscht sein Bild, verlässt den Raum und kommt dann nicht mehr an Annas Beitrag (403)
    const posts = (await (await page.request.get("/api/board")).json()).posts as { id: string; authorName: string }[];
    const annas = posts.find((p) => p.authorName === "Anna")!;
    expect((await benPage.request.delete(`/api/board/posts/${posts.find((p) => p.authorName === "Ben")!.id}`)).status()).toBe(204);
    await benPage.getByRole("button", { name: "Büro von Ben betreten" }).click();
    await expect(benPage.getByRole("button", { name: "Büro von Ben – du bist hier" })).toBeVisible({ timeout: 5000 });
    expect((await benPage.request.delete(`/api/board/posts/${annas.id}`)).status()).toBe(403);
    expect((await benPage.request.patch(`/api/board/posts/${annas.id}`, { data: { text: "fremd" } })).status()).toBe(403);
    expect((await page.request.delete(`/api/board/posts/${annas.id}`)).status()).toBe(204);
    await page.getByRole("button", { name: "Pinnwand ausblenden" }).first().click();
  });

  test("Avatar aus Mumble erscheint (AP9)", async () => {
    const [major, minor] = await serverVersion();
    test.skip(major > 1 || minor >= 6, "Mumble ≥ 1.6: Ice getTexture wirft für registrierte Nutzer (Fehler in Mumble); Ruumble zeigt Initialen");
    // registrierter Test-Bot setzt seinen Avatar selbst (so wie ein Mumble-Client über „Avatar ändern“)
    const { Bot } = loadBot();
    const first = new Bot("Robo");
    await first.connect();
    const userId = await registerUser("Robo", first.identity.sha1);
    first.close();
    await new Promise((r) => setTimeout(r, 500));
    const robo = new Bot("Robo"); // gleiches Zertifikat → jetzt registriert
    await robo.connect();
    robo.send("UserState", { session: robo.session, texture: solidPng(64, [230, 120, 20]) });
    try {
      const img = page.getByRole("region", { name: "Eingang" }).locator("img");
      await expect(img).toBeVisible({ timeout: 20_000 }); // Poll 1 s + Avatar-Abruf
      expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(64);
      const res = await page.request.get((await img.getAttribute("src")) as string);
      expect(res.headers()["content-type"]).toBe("image/png");
      // ohne Kopplung kein Bild
      const anon = await page.context().browser()!.newContext();
      expect((await anon.request.get(`http://127.0.0.1:8080/avatar/${userId}`)).status()).toBe(401);
      await anon.close();
    } finally {
      robo.close();
    }
  });

  test("ohne Kopplung: Hinweis statt Gebäude", async ({ browser }) => {
    const stranger = await browser.newPage();
    await stranger.goto("/");
    await expect(stranger.getByText("Dieses Gerät ist noch nicht gekoppelt.")).toBeVisible();
    await stranger.close();
  });

  test("Mumble beendet: Oberfläche meldet „nicht verbunden“", async () => {
    stopClient("Anna");
    await expect(page.getByText("Mumble ist nicht verbunden.")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe.serial(`Adresse aus der Root-Beschreibung (${distro})`, () => {
  test.afterAll(() => {
    for (const name of ["Dora", "Emil"]) try { stopClient(name); } catch { /* nicht gestartet */ }
    setRootDescription(false);
  });

  test("kurze Beschreibung: das Plugin findet die Adresse sofort", async () => {
    setRootDescription(false);
    runClient(distro, "Dora", "");
    expect(await pairUrl("Dora")).toMatch(/\/pair\?code=/);
  });

  test("lange Beschreibung: erst nach einmaligem Hover über den obersten Kanal", async () => {
    setRootDescription(true);
    runClient(distro, "Emil", "");
    const file = `${root}deploy/local/out/Emil/pair-url.txt`;
    await new Promise((r) => setTimeout(r, 10_000));
    expect(existsSync(file)).toBe(false); // Mumble hat den Text noch nicht geladen
    // wie ein Nutzer: Maus über den obersten Kanal (Tooltip lädt die Beschreibung nach)
    execFileSync("docker", ["exec", "ruumble-client-Emil", "bash", "-c",
      "export DISPLAY=:99; xdotool mousemove 320 73; sleep 0.3; xdotool mousemove 322 74; sleep 2"]);
    expect(await pairUrl("Emil")).toMatch(/\/pair\?code=/);
  });
});
