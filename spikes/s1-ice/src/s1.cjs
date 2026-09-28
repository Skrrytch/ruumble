// Machbarkeitstest S1: Alle geplanten Ice-Aufrufe mit dem READ-Secret, Gegenproben und Lastmessung.
const { execFileSync } = require("child_process");
const { connect } = require("./ice.cjs");
const { Bot } = require("./bot.cjs");

const READ = "s1-read-secret";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (cond, msg) => console.log(`${cond ? "✔" : "✘"} ${msg}`) || cond;
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : NaN; };
const stats = (arr) => `n=${arr.length} p50=${pct(arr, 50)} p95=${pct(arr, 95)} max=${Math.max(...arr)}`;
const dockerCpu = () => { try { return execFileSync("docker", ["stats", "--no-stream", "--format", "{{.CPUPerc}}", "s1-ice-mumble-1"]).toString().trim(); } catch { return "?"; } };

async function timed(bucket, fn) { const t = performance.now(); const r = await fn(); bucket.push(Math.round((performance.now() - t) * 10) / 10); return r; }

(async () => {
  const results = { ok: true };
  // ---------- Bots: Nutzer simulieren ----------
  const place = [
    ["Anna", "Büro von Anna"], ["Ben", "Lobby"], ["Felix", "Lobby"], ["Eva", "Lobby"],
    ["Gregor", "Teeküche"], ["Hanna", "Teeküche"], ["Ida", "Root"], ["Jonas", "ENTWICKLUNG"],
  ];
  for (let i = 1; i <= 22; i++) place.push([`Gast${String(i).padStart(2, "0")}`, ["Büro von Ben", "Büro von Clara", "Büro von David", "VERTRIEB", "Projektraum"][i % 5]]);
  const bots = [];
  for (const [name, ch] of place) {
    const b = new Bot(name);
    await b.connect();
    if (ch !== "Root") b.join(ch);
    bots.push(b);
    await sleep(60); // unter dem Nachrichten-Limit bleiben
  }
  const bot = (n) => bots.find((b) => b.name === n);
  bot("Ben").selfMute(true);
  bot("Felix").selfDeaf(true);
  bot("Eva").listen("Büro von Clara");
  bot("Jonas").join("Gregors Büro"); // muss vom Server abgelehnt werden
  await sleep(1500);

  // ---------- Ice mit READ-Secret ----------
  const { communicator, meta, server, MumbleServer } = await connect({ secret: READ });
  try {
    console.log("\n== Aufrufe mit Read-Secret ==");
    const [major, minor, patch, text] = await meta.getVersion();
    ok(major === 1 && minor === 6, `Meta.getVersion → ${major}.${minor}.${patch} (${text})`);
    const booted = await meta.getBootedServers();
    const serverId = await server.id();
    ok(booted.length === 1, `Meta.getBootedServers → ${booted.length} Server, id=${serverId}, Endpoint im Proxy: ${booted[0].ice_getEndpoints()[0].toString()}`);

    const registername = (await server.getConf("registername")) || (await meta.getDefaultConf()).get("registername") || "Root";
    ok(registername === "Musterhaus", `Server.getConf("registername") → "${registername}"`);

    const channels = await server.getChannels();
    const byName = new Map([...channels.values()].map((c) => [c.name, c]));
    const root = channels.get(0);
    ok(root && root.parent === -1, `getChannels → ${channels.size} Kanäle, Root id=0 parent=${root.parent}, Name in Ice="${root.name}"`);
    const tk = byName.get("Teeküche"), rk = byName.get("Raucherecke");
    ok(tk.links.includes(rk.id) && rk.links.includes(tk.id), `Links symmetrisch: Teeküche↔Raucherecke (${JSON.stringify(tk.links)} / ${JSON.stringify(rk.links)})`);
    ok(byName.get("VERTRIEB").position === 2 && byName.get("Büro von Clara").position === 2, "position wie gesetzt (VERTRIEB=2, Büro von Clara=2)");
    ok(byName.get("Unterkanal").parent === byName.get("Tiefer Raum").id, "3. Ebene sichtbar (Unterkanal unter Tiefer Raum)");

    const users = await server.getUsers();
    const u = (n) => [...users.values()].find((x) => x.name === n);
    ok(users.size === bots.length, `getUsers → ${users.size} Nutzer`);
    ok(u("Anna").session === bot("Anna").session, `Session aus Ice (${u("Anna").session}) = Session des Clients (${bot("Anna").session})`);
    ok(u("Ben").selfMute && !u("Ben").selfDeaf, "selfMute (Ben)");
    ok(u("Felix").selfDeaf && u("Felix").selfMute, "selfDeaf setzt selfMute mit (Felix)");
    ok(u("Ida").channel === 0, "Nutzer im Root-Kanal (Ida) → Eingang");
    ok(u("Jonas").channel === byName.get("ENTWICKLUNG").id, `Abgelehnter Wechsel: Jonas bleibt in ENTWICKLUNG, PermissionDenied beim Client: ${bot("Jonas").lastDenied ? "ja" : "nein"}`);
    const addr = Buffer.from(u("Anna").address);
    ok(addr.length === 16, `User.address → ${addr.toString("hex").replace(/(.{4})/g, "$1:").slice(0, -1)}`);

    const clara = byName.get("Büro von Clara");
    const listeners = await server.getListeningUsers(clara.id);
    ok(listeners.length === 1 && listeners[0] === u("Eva").session, `getListeningUsers(Büro von Clara) → ${JSON.stringify(listeners)} (Eva=${u("Eva").session})`);

    const gregor = byName.get("Gregors Büro");
    const canGregor = await server.hasPermission(u("Anna").session, gregor.id, MumbleServer.PermissionEnter);
    const canClara = await server.hasPermission(u("Anna").session, clara.id, MumbleServer.PermissionEnter);
    ok(!canGregor && canClara, `hasPermission(Enter): Gregors Büro=${canGregor}, Büro von Clara=${canClara}`);

    const certs = await server.getCertificateList(u("Anna").session);
    const crypto = require("crypto");
    const leafSha1 = crypto.createHash("sha1").update(Buffer.from(certs[0])).digest("hex");
    ok(leafSha1 === bot("Anna").identity.sha1, `getCertificateList[0] SHA1 = Hash des Client-Zertifikats (${leafSha1}) [P6, Serverseite]`);

    const uptime = await server.getUptime();
    ok(uptime > 0, `getUptime → ${uptime} s`);

    console.log("\n== Gegenproben: Schreiben mit Read-Secret muss scheitern ==");
    for (const [label, fn] of [
      ["setState", () => { const s = u("Anna"); s.channel = clara.id; return server.setState(s); }],
      ["addCallback", () => server.addCallback(null)],
      ["setChannelState", () => { const c = byName.get("Lobby"); c.name = "Gehackt"; return server.setChannelState(c); }],
    ]) {
      try { await fn(); results.ok = ok(false, `${label} wurde AUSGEFÜHRT`) && results.ok; }
      catch (e) { ok(e instanceof MumbleServer.InvalidSecretException, `${label} → ${e.ice_id ? e.ice_id() : e}`); }
    }
    try { const c2 = await connect({ secret: "falsch" }); await c2.server.getUsers().then(() => ok(false, "falsches Secret akzeptiert"), (e) => ok(true, `falsches Secret → ${e.ice_id()}`)); await c2.communicator.destroy(); } catch (e) { ok(true, `falsches Secret → ${e}`); }

    // ---------- Lastmessung ----------
    console.log("\n== Last: Ping der Bots ohne und mit Polling ==");
    const sample = async (seconds, poll) => {
      bots.forEach((b) => (b.pings = []));
      const t = { full: [], listeners: [] };
      const pinger = setInterval(() => bots.forEach((b) => b.ping()), 1000);
      const cpu = [];
      const end = Date.now() + seconds * 1000;
      let tick = 0;
      while (Date.now() < end) {
        const started = Date.now();
        if (poll) {
          await timed(t.full, () => Promise.all([server.getChannels(), server.getUsers(), server.getUptime()]));
          if (tick % 3 === 0) {
            const chs = await server.getChannels();
            await timed(t.listeners, () => Promise.all([...chs.keys()].map((id) => server.getListeningUsers(id))));
          }
        }
        if (tick % 10 === 5) cpu.push(dockerCpu());
        tick++;
        await sleep(Math.max(0, 1000 - (Date.now() - started)));
      }
      clearInterval(pinger);
      await sleep(300);
      return { ping: bots.flatMap((b) => b.pings), ...t, cpu };
    };
    const base = await sample(20, false);
    console.log(`ohne Polling: Bot-Ping ${stats(base.ping)} ms, CPU ${base.cpu.join(" ")}`);
    const load = await sample(60, true);
    console.log(`mit Polling:  Bot-Ping ${stats(load.ping)} ms, CPU ${load.cpu.join(" ")}`);
    console.log(`Ice getChannels+getUsers+getUptime (parallel): ${stats(load.full)} ms`);
    console.log(`Ice getListeningUsers für ${channels.size} Kanäle (parallel): ${stats(load.listeners)} ms`);
  } finally {
    await communicator.destroy();
    bots.forEach((b) => b.close());
  }
  process.exit(results.ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
