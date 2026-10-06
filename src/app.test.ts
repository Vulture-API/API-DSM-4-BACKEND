import { describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";

describe("monolito", () => {
  it("unifica os healthchecks", async () => {
    const app = buildApp();
    try {
      for (const url of ["/health", "/api/health", "/api/v1/health"]) {
        const response = await app.inject({ method: "GET", url });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: "ok", rules_engine: false });
      }
    } finally {
      await app.close();
    }
  });
});
