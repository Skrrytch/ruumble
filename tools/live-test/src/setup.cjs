// NUR Testvorbereitung: legt mit dem WRITE-Secret die Test-Kanäle an. Der Ruumble-Dienst nutzt dieses Secret nie.
const { connect } = require("./ice.cjs");

const TREE = {
  Lobby: [],
  ENTWICKLUNG: ["Büro von Anna", "Büro von Ben", "Büro von Clara", "Büro von David", "Büro von Eva", "Büro von Felix"],
  VERTRIEB: ["Abwesend", "Fokusraum (stumm)", "Teeküche", "Raucherecke", "Gregors Büro", "Projektraum"],
  ARCHIV: ["Aktenraum", "Tiefer Raum"], // bekommt einen Unterkanal → Etage gesperrt (too-deep)
};

(async () => {
  const { communicator, server, MumbleServer } = await connect({ secret: "s1-write-secret-only-for-setup" });
  try {
    const existing = await server.getChannels();
    const byName = new Map([...existing.values()].map((c) => [c.name, c]));
    const ensure = async (name, parent) => byName.get(name)?.id ?? (await server.addChannel(name, parent));
    let pos = 0;
    const ids = {};
    for (const [floor, rooms] of Object.entries(TREE)) {
      const fid = await ensure(floor, 0);
      ids[floor] = fid;
      const st = await server.getChannelState(fid); st.position = pos++; await server.setChannelState(st);
      let rpos = 0;
      for (const r of rooms) {
        ids[r] = await ensure(r, fid);
        const rs = await server.getChannelState(ids[r]); rs.position = rpos++; await server.setChannelState(rs);
      }
    }
    ids.deep = await ensure("Unterkanal", ids["Tiefer Raum"]);
    // Verlinkung Teeküche <-> Raucherecke (nur eine Seite setzen, Server macht sie symmetrisch)
    const tk = await server.getChannelState(ids["Teeküche"]);
    tk.links = [ids["Raucherecke"]]; await server.setChannelState(tk);
    // Gregors Büro: Enter für alle verbieten
    const acl = new MumbleServer.ACL(true, true, false, -1, "all", 0, MumbleServer.PermissionEnter);
    await server.setACL(ids["Gregors Büro"], [acl], [], true);
    // Root-Beschreibung mit der Ruumble-Adresse (ADR-0010); RUUMBLE_URL für den lokalen Live-Test
    const root = await server.getChannelState(0);
    // RUUMBLE_DESC_PAD verlängert die Beschreibung über 128 Zeichen: dann schickt Mumble nur einen Hash (ADR-0010)
    const pad = process.env.RUUMBLE_DESC_PAD ? "<p>" + "Willkommen im Musterhaus. ".repeat(6) + "</p>" : "";
    root.description = `${pad}Hier ein paar wichtige Konfigurationen für Ruumble:\n\n- ruumble: ${process.env.RUUMBLE_URL ?? "http://ruumble:8080"}\n\nDanke.`;
    await server.setChannelState(root);
    console.log(JSON.stringify(ids));
  } finally {
    await communicator.destroy();
  }
})().catch((e) => { console.error(e); process.exit(1); });
