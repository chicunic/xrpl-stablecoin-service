import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    alias: {
      "@token": path.resolve(__dirname, "./src/token"),
      "@bank": path.resolve(__dirname, "./src/bank"),
      "@common": path.resolve(__dirname, "./src/common"),
    },
    testTimeout: 120_000,
    fileParallelism: false,
  },
});
