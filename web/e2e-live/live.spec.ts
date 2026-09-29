/**
 * Live test: real Mumble server (version via MUMBLE_VERSION in the local stack, default v1.6.870), Ruumble service in a container and headless Mumble clients with the
 * real Ruumble plugin. The web UI controls Anna's Mumble client; what is checked is what the server reports back.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loadBot, registerUser, serverVersion, solidPng, unregisterUser } from "./mumble-admin.ts";

const root = new URL("../../", import.meta.url).pathname;
/** `bridgeUrl = ""`: no fixed address, the plugin reads it from the root description (ADR-0010) */
/** `lang`: system language of the client; the plugin writes its messages and receives notices in this language */
const runClient = (distro: string, name: string, bridgeUrl = "http://ruumble:8080", lang = "de_DE.UTF-8") =>
  execFileSync(`${root}deploy/local/run-client.sh`, [distro, name], { env: { ...process.env, BRIDGE_URL: bridgeUrl, CLIENT_LANG: lang } });
/** set the root description (test setup with write secret); `long`: over 128 characters → Mumble only sends a hash */
const setRootDescription = (long: boolean) =>
  execFileSync("node", ["src/setup.cjs"], { cwd: `${root}tools/live-test`, env: { ...process.env, RUUMBLE_DESC_PAD: long ? "1" : "" } });
const stopClient = (name: string) => execFileSync("docker", ["rm", "-f", `ruumble-client-${name}`]);

/** Mumble log of a test client (the plugin mirrors it to stderr with RUUMBLE_LOG_STDERR) */
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
    // diagnostics: record all messages to Anna's web UI (except snapshots)
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
    try { stopClient("Ben"); } catch { /* not started */ }
  });

  test("Kopplungslink des Plugins koppelt den Browser", async () => {
    const url = await pairUrl("Anna");
    expect(url).toMatch(/\/pair\?code=/);
    await page.goto(url);
    await expect(page).toHaveURL("http://127.0.0.1:8080/");
    await expect(page.getByRole("navigation", { name: "Aufzug – Etagen" })).toBeVisible();
    // freshly connected, Anna is in the root channel: entrance
    await expect(page.getByRole("region", { name: "Eingang" }).getByRole("img", { name: /Anna \(du\)/ })).toBeVisible();
    // the same link a second time: invalid
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
    await expect(board.getByRole("heading", { name: "Pinnwand" })).toBeVisible();
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
    await mute.click(); // unmute also lifts deaf (Mumble semantics)
    await expect(deaf).toHaveAttribute("aria-pressed", "false", { timeout: 5000 });
    await expect(mute).toHaveAttribute("aria-pressed", "false");
  });

  test("Zutrittsrecht aus Mumble: Gregors Büro ist gesperrt", async () => {
    await page.getByRole("button", { name: "2. Obergeschoss: VERTRIEB" }).click();
    await expect(page.getByRole("button", { name: "Gregors Büro – kein Zutritt" })).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Zu meiner Etage" }).click();
  });

  test("zweiter Client im selben Raum: sichtbar und hörbar", async () => {
    runClient(distro, "Ben", undefined, "en_US.UTF-8"); // Ben with an English system
    const benUrl = await pairUrl("Ben");
    ben = await page.context().browser()!.newContext();
    benPage = await ben.newPage();
    await benPage.goto(benUrl);
    await expect(benPage.getByRole("region", { name: "Eingang" }).getByRole("img", { name: /Ben \(du\)/ })).toBeVisible({ timeout: 10_000 });
    await benPage.getByRole("button", { name: "1. Obergeschoss: ENTWICKLUNG" }).click();
    await benPage.getByRole("button", { name: "Büro von Anna betreten" }).click();
    await expect(benPage.getByRole("button", { name: "Büro von Anna – du bist hier" })).toBeVisible({ timeout: 5000 });
    // Anna's web UI: Ben is in her room and talking (Anna's client hears him)
    await expect(page.getByRole("img", { name: /^Ben/ })).toBeVisible({ timeout: 5000 });
    // Ben's headless client sends the sine tone in bursts (~250 ms "talking" every ~2 s), so poll tightly:
    // the ring must appear at least once.
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
    await expect(benBoard.getByRole("heading", { name: "Pinnwand" })).toBeVisible();
    // Anna pins code: Ben sees it without reloading, his Mumble reports it, Anna's does not
    await annaBoard.getByRole("button", { name: "Als Code anheften" }).click();
    await annaBoard.getByRole("textbox", { name: "Neuer Beitrag" }).fill("const live = true;\nconsole.log(live);");
    await annaBoard.getByRole("button", { name: "Senden" }).click();
    await expect(benBoard.getByRole("article", { name: "Beitrag von Anna" }).locator(".hljs")).toBeVisible({ timeout: 5000 });
    await expect.poll(() => mumbleLog("Ben"), { timeout: 5000 }).toContain("ruumble-log: Anna pinned code to the board.");
    expect(mumbleLog("Anna")).not.toContain("an die Pinnwand geheftet");
    // Ben uploads a real image (XMLHttpRequest with progress, byte check in the service)
    const [chooser] = await Promise.all([benPage.waitForEvent("filechooser"), benBoard.getByRole("button", { name: "Bild oder Datei anhängen" }).click()]);
    await chooser.setFiles({ name: "punkt.png", mimeType: "image/png", buffer: Buffer.from(solidPng(40, [0, 120, 190])) });
    await expect(benBoard.getByText(/· bereit$/)).toBeVisible({ timeout: 5000 });
    await benBoard.getByRole("button", { name: "Senden" }).click();
    const image = annaBoard.getByRole("article", { name: "Beitrag von Ben" }).locator("img");
    await expect(image).toBeVisible({ timeout: 5000 });
    // visible does not mean loaded yet: wait for the finished image
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 5000 }).toBe(40);
    await expect.poll(() => mumbleLog("Anna"), { timeout: 5000 }).toContain("ruumble-log: Ben hat ein Bild an die Pinnwand geheftet.");
    // clean-up and permissions: Ben deletes his image, leaves the room and then can no longer reach Anna's post (403)
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
    // registered test bot sets its avatar itself (like a Mumble client via "Change avatar")
    const { Bot } = loadBot();
    const first = new Bot("Robo");
    await first.connect();
    const userId = await registerUser("Robo", first.identity.sha1);
    first.close();
    await new Promise((r) => setTimeout(r, 500));
    const robo = new Bot("Robo"); // same certificate → now registered
    await robo.connect();
    robo.send("UserState", { session: robo.session, texture: solidPng(64, [230, 120, 20]) });
    try {
      const img = page.getByRole("region", { name: "Eingang" }).locator("img");
      await expect(img).toBeVisible({ timeout: 20_000 }); // poll 1 s + avatar fetch
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 5000 }).toBe(64);
      const res = await page.request.get((await img.getAttribute("src")) as string);
      expect(res.headers()["content-type"]).toBe("image/png");
      // no pairing, no image
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
    for (const name of ["Dora", "Emil"]) try { stopClient(name); } catch { /* not started */ }
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
    expect(existsSync(file)).toBe(false); // Mumble has not loaded the text yet
    // like a user: mouse over the top channel (the tooltip loads the description)
    execFileSync("docker", ["exec", "ruumble-client-Emil", "bash", "-c",
      "export DISPLAY=:99; xdotool mousemove 320 73; sleep 0.3; xdotool mousemove 322 74; sleep 2"]);
    expect(await pairUrl("Emil")).toMatch(/\/pair\?code=/);
  });
});
