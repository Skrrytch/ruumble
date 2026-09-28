// slice2js 3.7.110: Der bin-Eintrag ist nur ein Modul mit compile(), als CLI tut er nichts.
// Deshalb compile() direkt aufrufen (fügt das Ice-Slice-Verzeichnis als -I hinzu).
const { compile } = require("slice2js");
const fs = require("fs");
fs.mkdirSync("gen", { recursive: true });
compile(["--output-dir", "gen", "../../third_party/mumble/src/murmur/MumbleServer.ice"], { stdio: "inherit" })
  .on("exit", (code) => {
    if (code !== 0 || !fs.existsSync("gen/MumbleServer.js")) { console.error("slice2js fehlgeschlagen"); process.exit(1); }
    console.log("gen/MumbleServer.js erzeugt");
  });
