import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  reporter: [["list"]],
  // Tests check the German texts (browser language de-DE); English and switching are checked by e2e/i18n.spec.ts
  use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, baseURL: "http://127.0.0.1:4173", locale: "de-DE" },
  webServer: { command: "pnpm build && pnpm preview --host 127.0.0.1 --port 4173 --strictPort", url: "http://127.0.0.1:4173", reuseExistingServer: false },
});
