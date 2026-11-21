import { describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import { InMemoryTriggeredAlertRepository } from "@/modules/alerts/repositories/in-memory-alert.repository.js";
import { FakeAuthRepository } from "@/modules/auth/testing/fake-auth.repository.js";

describe("authenticated alert acknowledgement", () => {
  it.each([{}, { acknowledged_by: 999 }])(
    "records the authenticated user regardless of supplied actor: %j",
    async (payload) => {
      const alerts = new InMemoryTriggeredAlertRepository();
      const alert = await alerts.create({ alert_config_id: 1, reading_id: 1 });
      const auth = new FakeAuthRepository();
      auth.credentials.push({
        id: 7,
        role_id: 2,
        name: "Test",
        email: "test@example.com",
        active: true,
        created_at: "2026-10-10T00:00:00.000Z",
        password_hash: "unused",
        permissions: ["triggered-alerts.acknowledge"],
      });
      const app = buildApp({
        jwtSecret: "test-secret-scrum-432-alert-actor-only",
        accessControlEnabled: true,
        authRepository: auth,
        triggeredAlertRepository: alerts,
      });
      try {
        await app.ready();
        const response = await app.inject({
          method: "PUT",
          url: `/api/alerts/triggered/${alert!.id}/acknowledge`,
          headers: { authorization: `Bearer ${app.jwt.sign({ sub: "7" })}` },
          payload,
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().acknowledged_by).toBe(7);
      } finally {
        await app.close();
      }
    },
  );
});
