// Machbarkeitstest S2: Plugin im echten Mumble-Client steuern und jedes Ergebnis per Ice (Read-Secret) prüfen.
// Aufruf: node src/s2.cjs <distro>   (Client-Container s2-<distro>-Anna muss laufen, siehe run-client.sh)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { connect } = require("../../s1-ice/src/ice.cjs");

const distro = process.argv[2] || "ubuntu";
const container = `s2-${distro}-Anna`;
const out = path.join(__dirname, `../out/${distro}-Anna`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (cond, msg) => { if (!cond) failed++; console.log(`${cond ? "✔" : "✘"} ${msg}`); return cond; };

const events = () => fs.readFileSync(path.join(out, "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const since = (n) => events().slice(n);
async function waitFor(pred, ms = 6000, from = 0) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const e = since(from).find(pred); if (e) return e; await sleep(100); }
  return null;
}
async function command(line, match) {
  const n = events().length;
  fs.appendFileSync(path.join(out, "cmd"), line + "\n");
  return waitFor((e) => e.ev === "result" && match(e), 8000, n);
}

(async () => {
  const client = events().find((e) => e.ev === "client");
  console.log(`== S2 mit Mumble ${client.mumble} (${distro}) ==`);
  const sync = await waitFor((e) => e.ev === "synchronized", 20000);
  ok(sync && sync.errors.every((x) => x === 0), `Plugin geladen und synchronisiert: Session ${sync?.session}`);

  const { communicator, server, MumbleServer } = await connect({ secret: "s1-read-secret" });
  const me = async () => [...(await server.getUsers()).values()].find((u) => u.session === sync.session);
  try {
    const cert = events().find((e) => e.ev === "clientCert");
    const u0 = await me();
    ok(u0 && u0.name === "Anna", `Session des Plugins (${sync.session}) = Session in Ice (${u0?.name})`);
    const leaf = crypto.createHash("sha1").update(Buffer.from((await server.getCertificateList(sync.session))[0])).digest("hex");
    ok(sync.hash === cert.sha1 && leaf === sync.hash, `P6: getUserHash (Plugin) = SHA1 Client-Zertifikat = getCertificateList[0] (Ice): ${sync.hash}`);

    const chans = await server.getChannels();
    const id = (name) => [...chans.values()].find((c) => c.name === name).id;

    console.log("\n-- Kanalwechsel aus dem Worker-Thread --");
    let r = await command(`join ${id("ENTWICKLUNG")}`, (e) => e.cmd === "join");
    ok(r?.result === "ok" && (await me()).channel === id("ENTWICKLUNG"), `join ENTWICKLUNG → ${r?.result} (API ${r?.apiMs} ms, bestätigt nach ${r?.totalMs} ms, Versuche ${r?.attempts})`);
    r = await command(`join ${id("Gregors Büro")}`, (e) => e.cmd === "join");
    ok(r?.result === "rejected" && (await me()).channel === id("ENTWICKLUNG"), `join Gregors Büro (Enter verboten) → ${r?.result} nach ${r?.totalMs} ms, API-Fehler ${r?.apiError}, Nutzer bleibt in ENTWICKLUNG`);
    r = await command(`join ${id("Büro von Anna")}`, (e) => e.cmd === "join");
    ok(r?.result === "ok" && (await me()).channel === id("Büro von Anna"), `join Büro von Anna → ${r?.result} (bestätigt nach ${r?.totalMs} ms)`);
    r = await command(`join ${id("Büro von Anna")}`, (e) => e.cmd === "join");
    console.log(`  · join in den eigenen Kanal → ${r?.result} nach ${r?.totalMs} ms (API sendet nichts, Mumble meldet kein channelEntered)`);

    console.log("\n-- Stumm / Taub (Semantik wie Mumble-Buttons) --");
    const iceState = async () => { await sleep(400); const u = await me(); return `selfMute=${u.selfMute} selfDeaf=${u.selfDeaf}`; };
    const step = async (line, expect) => {
      const [cmd] = line.split(" ");
      const res = await command(line, (e) => e.cmd === cmd);
      const st = await iceState();
      ok(st === expect, `${line.padEnd(7)} → changed=${res?.changed} API ${res?.apiMs} ms | Ice: ${st}`);
    };
    await step("mute 1", "selfMute=true selfDeaf=false");
    await step("mute 1", "selfMute=true selfDeaf=false");
    await step("deaf 1", "selfMute=true selfDeaf=true");
    await step("mute 0", "selfMute=false selfDeaf=false"); // Unmute hebt Taub mit auf
    await step("deaf 1", "selfMute=true selfDeaf=true");  // Taub stellt stumm (unmuteOnUndeaf)
    await step("deaf 0", "selfMute=false selfDeaf=false"); // Undeaf hebt Stumm wieder auf
    await step("mute 1", "selfMute=true selfDeaf=false");
    await step("deaf 1", "selfMute=true selfDeaf=true");
    await step("deaf 0", "selfMute=true selfDeaf=false");  // war vorher schon stumm → bleibt stumm
    await step("mute 0", "selfMute=false selfDeaf=false");

    console.log("\n-- Schnelle Wechsel (Rate-Limit des Servers) --");
    const targets = ["Büro von Ben", "Büro von Clara", "Büro von David", "Büro von Eva", "Büro von Felix", "Büro von Anna"];
    const n = events().length;
    for (const t of targets) fs.appendFileSync(path.join(out, "cmd"), `join ${id(t)}\n`);
    const end = Date.now() + 30000;
    while (Date.now() < end && since(n).filter((e) => e.ev === "result").length < targets.length) await sleep(200);
    const res = since(n).filter((e) => e.ev === "result").map((e) => e.result);
    console.log(`  · 6 Wechsel direkt hintereinander → ${JSON.stringify(res)}; Ice-Kanal jetzt: ${chans.get((await me()).channel).name}`);

    console.log("\n-- Sprechereignisse (zweiter Client Ben, beide senden dauerhaft einen Sinuston) --");
    const own = events().filter((e) => e.ev === "talking" && e.session === sync.session);
    ok(own.some((e) => e.state === 1), `eigenes Sprechen gemeldet (${own.length} Ereignis(se), Zustand 1 = TALKING)`);
    execFileSync(path.join(__dirname, "../run-client.sh"), [distro, "Ben"]);
    const benOut = path.join(__dirname, `../out/${distro}-Ben`);
    const benEvents = () => { try { return fs.readFileSync(path.join(benOut, "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)); } catch { return []; } };
    let benSync = null;
    for (let i = 0; i < 100 && !benSync; i++) { benSync = benEvents().find((e) => e.ev === "synchronized"); await sleep(200); }
    const annaChannel = (await me()).channel;
    const count = (from) => since(from).filter((e) => e.ev === "talking" && e.session === benSync.session);
    let mark = events().length;
    fs.appendFileSync(path.join(benOut, "cmd"), `join ${annaChannel}\n`);
    await sleep(4000);
    const same = count(mark);
    ok(same.some((e) => e.state === 1), `Ben im selben Raum → Anna erhält talking für Ben: ${JSON.stringify(same.map((e) => e.state))}`);
    fs.appendFileSync(path.join(benOut, "cmd"), `join ${id("Büro von Ben")}\n`);
    await sleep(1500);
    mark = events().length;
    await sleep(4000);
    const other = count(mark);
    ok(other.length === 0, `Ben in anderem Raum → keine talking-Ereignisse mehr bei Anna (${other.length})`);
    fs.appendFileSync(path.join(out, "cmd"), `deaf 1\n`);
    fs.appendFileSync(path.join(benOut, "cmd"), `join ${annaChannel}\n`);
    await sleep(1500);
    mark = events().length;
    await sleep(4000);
    const deaf = count(mark);
    ok(deaf.length === 0, `Anna taub, Ben wieder im selben Raum → keine talking-Ereignisse (${deaf.length})`);
    fs.appendFileSync(path.join(out, "cmd"), `deaf 0\n`);
    execFileSync("docker", ["rm", "-f", `s2-${distro}-Ben`]);

    console.log("\n-- Server-Neustart: disconnected, Reconnect, neues synchronized --");
    const m = events().length;
    execFileSync("docker", ["restart", "s1-ice-mumble-1"]);
    const disc = await waitFor((e) => e.ev === "disconnected", 20000, m);
    const resync = await waitFor((e) => e.ev === "synchronized", 60000, m);
    ok(disc && resync, `disconnected: ${!!disc}, erneut synchronisiert: Session ${resync?.session} (vorher ${sync.session})`);
  } finally {
    await communicator.destroy();
  }

  console.log("\n-- Beenden: mumble_shutdown und join des Worker-Threads --");
  const k = events().length;
  // Wie ein Nutzer: Strg+Q im Hauptfenster (SIGTERM beendet Mumble dagegen ohne Plugin-Shutdown).
  execFileSync("docker", ["exec", container, "bash", "-c",
    'export DISPLAY=:99; w=$(xdotool search --name "^Mumble" | head -1); xdotool windowfocus --sync $w; xdotool key ctrl+q']);
  const shut = await waitFor((e) => e.ev === "shutdown", 15000, k);
  ok(shut && shut.joinMs <= 1000, shut ? `Strg+Q → shutdown, Worker beendet nach ${shut.joinMs} ms` : "kein shutdown-Ereignis nach Strg+Q");

  console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : "\nAlle Prüfungen bestanden");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
