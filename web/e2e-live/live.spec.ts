/**
 * Live-Test: echter Mumble-Server (v1.6.870), Ruumble-Dienst im Container und headless Mumble-Clients mit dem
 * echten Ruumble-Plugin. Die Oberfläche steuert Annas Mumble-Client; geprüft wird, was der Server zurückmeldet.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const root = new URL("../../", import.meta.url).pathname;
/** `bridgeUrl = ""`: ohne feste Adresse, das Plugin liest sie aus der Root-Beschreibung (ADR-0010) */
const runClient = (distro: string, name: string, bridgeUrl = "http://ruumble:8080") =>
  execFileSync(`${root}deploy/local/run-client.sh`, [distro, name], { env: { ...process.env, BRIDGE_URL: bridgeUrl } });
/** Root-Beschreibung setzen (Testvorbereitung mit Write-Secret); `long`: über 128 Zeichen → Mumble schickt nur einen Hash */
const setRootDescription = (long: boolean) =>
  execFileSync("node", ["src/setup.cjs"], { cwd: `${root}spikes/s1-ice`, env: { ...process.env, RUUMBLE_DESC_PAD: long ? "1" : "" } });
const stopClient = (name: string) => execFileSync("docker", ["rm", "-f", `ruumble-client-${name}`]);

async function pairUrl(name: string): Promise<string> {
  const file = `${root}deploy/local/out/${name}/pair-url.txt`;
  for (let i = 0; i < 120 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 250));
  return readFileSync(file, "utf8").trim();
}

const distro = process.env.RUUMBLE_CLIENT ?? "ubuntu";
const frames: string[] = [];

test.describe.serial(`Live mit Mumble-Client (${distro})`, () => {
  let page: Page;

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
    const ben = await page.context().browser()!.newContext();
    const benPage = await ben.newPage();
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
    await ben.close();
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
