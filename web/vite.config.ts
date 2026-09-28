import { readFileSync } from "node:fs";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  plugins: [svelte()],
  define: { __UI_VERSION__: JSON.stringify(pkg.version) },
  // docs/design/tokens.css liegt außerhalb von web/ und ist die einzige Quelle für Farben und Maße
  server: {
    fs: { allow: [".."] },
    // ?live im Dev-Server: Dienst lokal auf :8080
    proxy: {
      "/ws": { target: "ws://127.0.0.1:8080", ws: true },
      ...Object.fromEntries(["/pair", "/api", "/avatar", "/download"].map((p) => [p, "http://127.0.0.1:8080"])),
    },
  },
});
