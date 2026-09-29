/**
 * Generates schema/protocol.schema.json from the zod schemas (docs and third-party tools; the plugin validates itself).
 * With --check it only checks whether the file is up to date (CI).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { Messages, PROTOCOL_VERSION } from "../src/index.ts";

const target = new URL("../schema/protocol.schema.json", import.meta.url);
const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: `Ruumble protocol v${PROTOCOL_VERSION}`,
  description: "Generated from protocol/src/index.ts – do not edit by hand (pnpm -F @ruumble/protocol gen:schema).",
  $defs: Object.fromEntries(Object.entries(Messages).map(([name, s]) => [name, z.toJSONSchema(s)])),
};
const text = JSON.stringify(schema, null, 2) + "\n";

if (process.argv.includes("--check")) {
  let current = "";
  try { current = readFileSync(target, "utf8"); } catch { /* missing */ }
  if (current !== text) {
    console.error("schema/protocol.schema.json is out of date: pnpm -F @ruumble/protocol gen:schema");
    process.exit(1);
  }
  console.log("protocol.schema.json is up to date");
} else {
  writeFileSync(target, text);
  console.log("schema/protocol.schema.json written");
}
