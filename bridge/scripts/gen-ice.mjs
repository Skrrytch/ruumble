// Erzeugt gen/MumbleServer.cjs aus third_party/mumble/src/murmur/MumbleServer.ice.
// slice2js 3.7.110: Die CLI ist kaputt (tut still nichts), deshalb compile() direkt (S1).
import { createRequire } from "node:module";
import { existsSync, mkdirSync, renameSync } from "node:fs";
const require = createRequire(import.meta.url);
const { compile } = require("slice2js");
const ice = new URL("../../third_party/mumble/src/murmur/MumbleServer.ice", import.meta.url).pathname;
const out = new URL("../gen/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
compile(["--output-dir", out, ice], { stdio: "inherit" }).on("exit", (code) => {
  if (code !== 0 || !existsSync(out + "MumbleServer.js")) {
    console.error("slice2js fehlgeschlagen");
    process.exit(1);
  }
  renameSync(out + "MumbleServer.js", out + "MumbleServer.cjs"); // CommonJS im ESM-Paket
});
