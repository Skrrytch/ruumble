import { readFileSync } from "node:fs";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  plugins: [svelte()],
  define: { __UI_VERSION__: JSON.stringify(pkg.version) },
  // Workspace packages (e.g. protocol/) live outside web/
  server: {
    fs: { allow: [".."] },
    // ?live in the dev server: service locally on :64080
    proxy: {
      "/ws": { target: "ws://127.0.0.1:64080", ws: true },
      ...Object.fromEntries(["/pair", "/api", "/avatar", "/download"].map((p) => [p, "http://127.0.0.1:64080"])),
    },
  },
});
