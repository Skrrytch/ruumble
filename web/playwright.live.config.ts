import { defineConfig, devices } from "@playwright/test";

// Live-Test gegen deploy/local (echter Mumble-Server, Ruumble-Dienst, headless Clients mit Plugin).
//   docker compose -f deploy/local/docker-compose.yml up -d --build && (cd tools/live-test && node src/setup.cjs)
//   pnpm -F @ruumble/web exec playwright test -c playwright.live.config.ts
export default defineConfig({
  testDir: "e2e-live",
  outputDir: "test-results-live",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  // Tests prüfen die deutschen Texte (Browser-Sprache de-DE); Englisch prüft e2e/i18n.spec.ts
  use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, baseURL: "http://127.0.0.1:8080", locale: "de-DE" },
});
