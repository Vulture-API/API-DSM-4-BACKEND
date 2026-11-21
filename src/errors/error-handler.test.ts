import { describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";

describe("handleError (erros 4xx do Fastify e Zod)", () => {
  it("should_return_400_for_malformed_json_body", async () => {
    const app = buildApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/devops/outages",
        headers: { "content-type": "application/json" },
        payload: "{not json",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("BAD_REQUEST");
    } finally {
      await app.close();
    }
  });

  it("should_return_413_when_body_exceeds_the_limit", async () => {
    const app = buildApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/devops/outages",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ reason: "x".repeat(3 * 1024 * 1024) }),
      });

      expect(response.statusCode).toBe(413);
      expect(response.json().code).toBe("PAYLOAD_TOO_LARGE");
    } finally {
      await app.close();
    }
  });

  it("should_return_400_when_manual_zod_validation_fails", async () => {
    const app = buildApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/devops/outages",
        payload: { service: "INVALIDO" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("VALIDATION_ERROR");
    } finally {
      await app.close();
    }
  });
});

describe("handleUsersError (rotas de auth)", () => {
  it("should_return_400_for_malformed_json_on_login", async () => {
    const app = buildApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "content-type": "application/json" },
        payload: "{not json",
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it("should_return_413_for_oversized_login_body", async () => {
    const app = buildApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ email: "x".repeat(3 * 1024 * 1024) }),
      });

      expect(response.statusCode).toBe(413);
    } finally {
      await app.close();
    }
  });
});

describe("handleParametersError (sensores e tipos)", () => {
  it("should_return_413_for_oversized_sensor_type_body", async () => {
    const app = buildApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/sensor-types",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ name: "a".repeat(2_000_000) }),
      });

      expect(response.statusCode).toBe(413);
    } finally {
      await app.close();
    }
  });
});
