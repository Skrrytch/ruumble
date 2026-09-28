import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BridgeToPlugin, BridgeToUi, Messages, PluginToBridge, Snapshot, UiToBridge, parse } from "../src/index.ts";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
const messages = JSON.parse(fixture("messages.json")) as Record<string, unknown[]>;

describe("Snapshot-Fixtures", () => {
  const files = readdirSync(new URL("../fixtures/", import.meta.url)).filter((f) => f !== "messages.json");

  it.each(files)("%s ist ein gültiger Snapshot", (file) => {
    expect(parse(Snapshot, fixture(file))).not.toBeNull();
  });

  it.each(files)("%s ist in sich stimmig (Root, Eltern, Links, Nutzer)", (file) => {
    const s = Snapshot.parse(JSON.parse(fixture(file)));
    const ids = new Set(s.channels.map((c) => c.id));
    expect(s.channels.filter((c) => c.parent === null).map((c) => c.id)).toEqual([0]);
    for (const c of s.channels) {
      if (c.parent !== null) expect(ids).toContain(c.parent);
      for (const l of c.links) expect(s.channels.find((o) => o.id === l)?.links).toContain(c.id); // symmetrisch wie in Mumble
    }
    for (const u of s.users) expect(ids).toContain(u.channel);
    if (s.self) expect(s.users.map((u) => u.session)).toContain(s.self.session);
  });
});

describe("Nachrichten", () => {
  const families = { PluginToBridge, BridgeToPlugin, UiToBridge, BridgeToUi } as const;

  for (const [name, schema] of Object.entries(families)) {
    it.each(messages[name] ?? [])(`${name}: %j`, (msg) => {
      expect(parse(schema, JSON.stringify(msg))).toEqual(msg);
    });
  }

  it.each(messages.invalid ?? [])("ungültig: %j", (msg) => {
    for (const schema of Object.values(Messages)) expect(parse(schema, JSON.stringify(msg))).toBeNull();
  });

  it("parse wirft nie, auch nicht bei kaputtem JSON", () => {
    expect(parse(PluginToBridge, "{kaputt")).toBeNull();
    expect(parse(PluginToBridge, "null")).toBeNull();
  });
});
