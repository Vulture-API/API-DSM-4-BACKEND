import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

const integrationFiles = [
  "src/**/*.route.test.ts",
  "src/**/*.integration.test.ts",
];

// No CI, cada nível roda uma vez e guarda a cobertura parcial; o mínimo de 80%
// é cobrado depois, na junção dos dois níveis (npm run test:ci:coverage).
const coberturaParcial = process.env.COBERTURA_PARCIAL === "1";

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
      reporter: coberturaParcial ? [] : ["text", "lcov", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        "src/**/*.test.ts",
        "src/**/types/**",
        "src/**/testing/**",
      ],
      thresholds: coberturaParcial ? {} : { lines: 80 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...integrationFiles],
        },
      },
      {
        extends: true,
        test: { name: "integration", include: integrationFiles },
      },
    ],
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
