import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.spec.ts"],
    exclude: ["tests/integration/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.{ts,js}"],
      exclude: ["src/**/*.d.ts", "src/token/index.ts", "src/bank/index.ts", "src/common/config/firebase.ts"],
    },
    alias: {
      "@token": path.resolve(__dirname, "./src/token"),
      "@bank": path.resolve(__dirname, "./src/bank"),
      "@common": path.resolve(__dirname, "./src/common"),
    },
    testTimeout: 15000,
    setupFiles: ["./tests/setup.ts"],
    clearMocks: true,
    restoreMocks: false,
  },
});
