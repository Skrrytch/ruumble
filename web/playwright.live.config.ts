import { defineConfig, devices } from "@playwright/test";

// Live test against deploy/local (real Mumble server, Ruumble service, headless clients with plugin).
//   docker compose -f deploy/local/docker-compose.yml up -d --build && (cd tools/live-test && node src/setup.cjs)
//   pnpm -F @ruumble/web exec playwright test -c playwright.live.config.ts
export default defineConfig({
  testDir: "e2e-live",
  outputDir: "test-results-live",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  // Tests check the English texts (browser language en-US); German is checked by e2e/i18n.spec.ts
  use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, baseURL: "http://127.0.0.1:64080", locale: "en-US" },
});
