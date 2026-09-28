import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  reporter: [["list"]],
  use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, baseURL: "http://127.0.0.1:4173" },
  webServer: { command: "pnpm build && pnpm preview --host 127.0.0.1 --port 4173 --strictPort", url: "http://127.0.0.1:4173", reuseExistingServer: false },
});
