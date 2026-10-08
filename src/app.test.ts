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

describe("compatibilidade do backend único", () => {
  it("atende todos os aliases de parâmetros e preflight", async () => {
    const app = buildApp();
    try {
      for (const prefix of ["", "/v1", "/api", "/api/v1"]) {
        for (const resource of ["sensors", "sensor-types"]) {
          const url = `${prefix}/${resource}`;
          expect((await app.inject({ method: "GET", url })).statusCode).toBe(
            200,
          );
          const preflight = await app.inject({ method: "OPTIONS", url });
          expect(preflight.statusCode).toBe(204);
          expect(preflight.headers["access-control-allow-origin"]).toBe("*");
        }
      }
    } finally {
      await app.close();
    }
  });

  it("preserva envelopes de validação por domínio", async () => {
    const app = buildApp();
    try {
      const users = await app.inject({
        method: "POST",
        url: "/api/users",
        payload: {},
      });
      const sensors = await app.inject({
        method: "POST",
        url: "/api/sensors",
        payload: {},
      });
      const stations = await app.inject({
        method: "POST",
        url: "/api/stations",
        payload: {},
      });
      const alerts = await app.inject({
        method: "POST",
        url: "/api/alerts/config",
        payload: {},
      });
      for (const response of [users, sensors, stations, alerts])
        expect(response.statusCode).toBe(400);
      expect(users.json()).toMatchObject({
        code: 400,
        message: "Invalid data",
        details: expect.any(Array),
      });
      expect(sensors.json()).toMatchObject({
        code: 400,
        message: "Bad request - validation error",
        details: expect.any(Array),
      });
      for (const response of [stations, alerts])
        expect(response.json()).toMatchObject({
          statusCode: 400,
          code: "VALIDATION_ERROR",
          errors: expect.any(Array),
        });
      expect(users.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("informa que o motor está indisponível quando não foi injetado", async () => {
    const app = buildApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/internal/rules-engine/run",
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe("RULES_ENGINE_UNAVAILABLE");
    } finally {
      await app.close();
    }
  });
});
