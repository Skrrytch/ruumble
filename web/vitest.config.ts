import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";
export default defineConfig({
  // Runen in *.svelte.ts (z. B. i18n) auch in den Unit-Tests
  plugins: [svelte()],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    coverage: {
      include: ["src/lib/model/**", "src/lib/board/model.ts", "src/lib/board/render.ts", "src/lib/i18n/**"],
      thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 },
    },
  },
});
