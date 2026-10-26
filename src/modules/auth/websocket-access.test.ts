import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "@/app.js";
import { FakeAuthRepository } from "@/modules/auth/testing/fake-auth.repository.js";
import { InMemoryMonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import { ReadingsBroadcaster } from "@/modules/monitoring/services/readings-broadcaster.js";

function reading(id: number) {
  return {
    reading_id: id,
    station_id: 1,
    sensor_id: 1,
    local_identifier: "temp",
    sensor_type_id: 1,
    sensor_type: "Temperatura",
    unit_of_measure: "C",
    value: 20 + id,
    unix_time: 1790000000 + id,
  };
}

describe("WebSocket authorization and revocation", () => {
  let app: FastifyInstance;
  let auth: FakeAuthRepository;
  let monitoring: InMemoryMonitoringRepository;
  let broadcaster: ReadingsBroadcaster;
  beforeEach(async () => {
    auth = new FakeAuthRepository();
    auth.credentials.push({
      id: 1,
      role_id: 1,
      name: "Test",
      email: "test@example.com",
      active: true,
      created_at: "2026-10-10T00:00:00.000Z",
      password_hash: "unused",
      permissions: ["monitoring.read"],
    });
    monitoring = new InMemoryMonitoringRepository();
    broadcaster = new ReadingsBroadcaster(monitoring, { intervalMs: 10 });
    app = buildApp({
      jwtSecret: "test-secret-scrum-432-websocket-only",
      accessControlEnabled: true,
      authRepository: auth,
      monitoringRepository: monitoring,
      readingsBroadcaster: broadcaster,
    });
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });

  it("rejects missing credentials and grants before upgrading", async () => {
    await expect(app.injectWS("/api/stations/current/ws")).rejects.toThrow(
      "401",
    );
    auth.credentials[0]!.permissions = [];
    await expect(
      app.injectWS("/api/stations/current/ws", {
        headers: { authorization: `Bearer ${app.jwt.sign({ sub: "1" })}` },
      }),
    ).rejects.toThrow("403");
  });

  it.each(["bearer", "cookie"])(
    "accepts %s authentication and sends readings",
    async (kind) => {
      const token = app.jwt.sign({ sub: "1" });
      const headers =
        kind === "bearer"
          ? { authorization: `Bearer ${token}` }
          : { cookie: `agritech_ws_token=${token}` };
      const socket = await app.injectWS("/api/stations/current/ws", {
        headers,
      });
      const messages: unknown[] = [];
      socket.on("message", (data) => messages.push(JSON.parse(String(data))));
      await vi.waitFor(() => expect(broadcaster.isPolling).toBe(true));
      await new Promise((resolve) => setTimeout(resolve, 20));
      monitoring.liveReadings.push(reading(1));
      await vi.waitFor(() => expect(messages).toHaveLength(1));
      expect(messages[0]).toEqual({ type: "reading", ...reading(1) });
      socket.terminate();
      await vi.waitFor(() => expect(broadcaster.subscribers).toBe(0));
    },
  );

  it.each(["revoked", "inactive", "deleted", "database failure", "expired"])(
    "closes an existing subscription on %s before sending more data",
    async (reason) => {
      const token = app.jwt.sign(
        { sub: "1" },
        reason === "expired" ? { expiresIn: 2 } : {},
      );
      const socket = await app.injectWS("/api/stations/current/ws", {
        headers: { authorization: `Bearer ${token}` },
      });
      const messages: unknown[] = [];
      socket.on("message", (data) => messages.push(data));
      const closed = new Promise<number>((resolve) =>
        socket.on("close", (code) => resolve(code)),
      );
      await vi.waitFor(() => expect(broadcaster.subscribers).toBe(1));
      if (reason === "revoked") auth.credentials[0]!.permissions = [];
      if (reason === "inactive") auth.credentials[0]!.active = false;
      if (reason === "deleted") auth.credentials = [];
      if (reason === "database failure")
        vi.spyOn(auth, "findUserById").mockRejectedValue(
          new Error("Unavailable"),
        );
      expect(await closed).toBe(1008);
      monitoring.liveReadings.push(reading(1));
      expect(broadcaster.subscribers).toBe(0);
      expect(messages).toEqual([]);
    },
  );
});
