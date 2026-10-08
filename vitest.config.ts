import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      PORT: "3000",
      DATABASE_URL: "postgresql://user:password@localhost:5432/test",
      RULES_ENGINE_ENABLED: "false",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/**/*.test.ts",
        "src/**/types/**",
        "src/**/testing/**",
      ],
      thresholds: { lines: 80 },
    },
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
