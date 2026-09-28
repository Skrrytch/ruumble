import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: { include: ["src/lib/model/**"], thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 } },
  },
});
