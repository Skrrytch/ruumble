// slice2js 3.7.110: the bin entry is just a module with compile(); as a CLI it does nothing.
// Hence call compile() directly (adds the Ice slice directory as -I).
const { compile } = require("slice2js");
const fs = require("fs");
fs.mkdirSync("gen", { recursive: true });
compile(["--output-dir", "gen", "../../third_party/mumble/src/murmur/MumbleServer.ice"], { stdio: "inherit" })
  .on("exit", (code) => {
    if (code !== 0 || !fs.existsSync("gen/MumbleServer.js")) { console.error("slice2js fehlgeschlagen"); process.exit(1); }
    console.log("gen/MumbleServer.js erzeugt");
  });
