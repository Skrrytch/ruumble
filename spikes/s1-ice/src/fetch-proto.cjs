// Nur für die Test-Bots: Mumble.proto des festgelegten Releases laden (nicht Teil von third_party).
const fs = require("fs");
const tag = fs.readFileSync(__dirname + "/../../../third_party/mumble/VERSION", "utf8").trim();
fetch(`https://raw.githubusercontent.com/mumble-voip/mumble/${tag}/src/Mumble.proto`)
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
  .then((t) => { fs.writeFileSync(__dirname + "/../gen/Mumble.proto", t); console.log("Mumble.proto", tag); });
