// Test preparation ONLY: creates the test channels with the WRITE secret. The Ruumble service never uses this secret.
const { connect } = require("./ice.cjs");

const TREE = {
  Lobby: [],
  DEVELOPMENT: ["Anna's office", "Ben's office", "Clara's office", "David's office", "Eva's office", "Felix's office"],
  SALES: ["Away", "Focus room (muted)", "Kitchen", "Coffee corner", "Gregor's office", "Project room"],
  ARCHIVE: ["File room", "Deep room"], // gets a sub-channel → floor locked (too-deep)
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
    ids.deep = await ensure("Subchannel", ids["Deep room"]);
    // Link Kitchen <-> Coffee corner (set one side only, the server makes it symmetric)
    const tk = await server.getChannelState(ids["Kitchen"]);
    tk.links = [ids["Coffee corner"]]; await server.setChannelState(tk);
    // Gregor's office: deny Enter for all
    const acl = new MumbleServer.ACL(true, true, false, -1, "all", 0, MumbleServer.PermissionEnter);
    await server.setACL(ids["Gregor's office"], [acl], [], true);
    // Root description with the Ruumble address (ADR-0010); RUUMBLE_URL for the local live test
    const root = await server.getChannelState(0);
    // RUUMBLE_DESC_PAD extends the description beyond 128 characters: then Mumble only sends a hash (ADR-0010)
    const pad = process.env.RUUMBLE_DESC_PAD ? "<p>" + "Welcome to Acme HQ. ".repeat(6) + "</p>" : "";
    root.description = `${pad}Here are a few important settings for Ruumble:\n\n- ruumble: ${process.env.RUUMBLE_URL ?? "http://ruumble:64080"}\n\nThanks.`;
    await server.setChannelState(root);
    console.log(JSON.stringify(ids));
  } finally {
    await communicator.destroy();
  }
})().catch((e) => { console.error(e); process.exit(1); });
