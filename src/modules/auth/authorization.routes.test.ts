import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import {
  InMemoryAlertConfigRepository,
  InMemoryTriggeredAlertRepository,
} from "@/modules/alerts/repositories/in-memory-alert.repository.js";
import { FakeAuthRepository } from "@/modules/auth/testing/fake-auth.repository.js";
import { InMemoryMonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import { InMemoryOccurrenceRepository } from "@/modules/occurrences/testing/in-memory-occurrence.repository.js";
import type { PermissionCode } from "@/modules/permissions/permission-catalog.js";
import { FakeRoleRepository } from "@/modules/roles/testing/fake-role.repository.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";
import { InMemoryStatisticsRepository } from "@/modules/statistics/repositories/statistics.repository.js";
import { FakeUserRepository } from "@/modules/users/testing/fake-repositories.js";

const readCases: { permission: PermissionCode; paths: string[] }[] = [
  { permission: "users.read", paths: ["/api/users", "/api/users/1"] },
  { permission: "roles.read", paths: ["/api/roles", "/api/roles/2"] },
  {
    permission: "stations.read",
    paths: ["/api/stations", "/api/stations/1/status"],
  },
  {
    permission: "properties.read",
    paths: ["/api/properties", "/api/stations/properties"],
  },
  {
    permission: "sensors.read",
    paths: ["/sensors", "/v1/sensors", "/api/sensors", "/api/v1/sensors"],
  },
  {
    permission: "sensor-types.read",
    paths: [
      "/sensor-types",
      "/v1/sensor-types",
      "/api/sensor-types",
      "/api/v1/sensor-types",
    ],
  },
  {
    permission: "monitoring.read",
    paths: [
      "/api/stations/current",
      "/api/stations/overview",
      "/api/stations/readings/series",
      "/api/stations/statistics",
      "/api/stations/1/forecast",
      "/api/readings",
      "/readings",
      "/api/v1/readings",
    ],
  },
  { permission: "alert-configs.read", paths: ["/api/alerts/config"] },
  { permission: "triggered-alerts.read", paths: ["/api/alerts/triggered"] },
  { permission: "occurrences.read", paths: ["/api/occurrences"] },
];

describe.each([false, true])(
  "authorization compatibility (ACCESS_CONTROL_ENABLED=%s)",
  (enabled) => {
    let app: FastifyInstance;
    let auth: FakeAuthRepository;
    let headers: { authorization: string };

    beforeEach(async () => {
      const users = new FakeUserRepository();
      const user = await users.create({
        roleId: 2,
        name: "User",
        email: "user@example.com",
        passwordHash: "unused",
        active: true,
      });
      auth = new FakeAuthRepository();
      auth.credentials.push({
        ...user,
        permissions: [],
        password_hash: "unused",
      });
      const stations = new InMemoryStationRepository();
      await stations.create({
        property_id: 1,
        mac_address: "AA:BB:CC:DD:EE:01",
        name: "Station",
        latitude: -23,
        longitude: -45,
      });
      app = buildApp({
        accessControlEnabled: enabled,
        jwtSecret: "scrum434-test-authorization-routes-secret",
        authRepository: auth,
        userRepository: users,
        roleRepository: new FakeRoleRepository(),
        stationRepository: stations,
        monitoringRepository: new InMemoryMonitoringRepository(),
        statisticsRepository: new InMemoryStatisticsRepository(),
        forecastProvider: { source: "test", daily: async () => [] },
        alertConfigRepository: new InMemoryAlertConfigRepository(),
        triggeredAlertRepository: new InMemoryTriggeredAlertRepository(),
        occurrenceRepository: new InMemoryOccurrenceRepository(),
      });
      await app.ready();
      headers = {
        authorization: `Bearer ${app.jwt.sign({ sub: String(user.id) })}`,
      };
    });
    afterEach(async () => {
      await app.close();
    });

    it("allows real reads with the corresponding grant across modules and preserves legacy anonymous access", async () => {
      for (const { permission, paths } of readCases) {
        for (const url of paths) {
          auth.credentials[0]!.permissions = [];
          expect(
            (await app.inject({ url })).statusCode,
            `anonymous ${url}`,
          ).toBe(enabled ? 401 : 200);
          expect(
            (await app.inject({ url, headers })).statusCode,
            `no grants ${url}`,
          ).toBe(enabled ? 403 : 200);
          auth.credentials[0]!.permissions = [permission];
          expect(
            (await app.inject({ url, headers })).statusCode,
            `${permission} ${url}`,
          ).toBe(200);
          const head = await app.inject({ method: "HEAD", url, headers });
          expect(head.statusCode, `HEAD ${url}`).toBe(200);
          expect(head.body).toBe("");
        }
      }
    });

    it("always protects identity, permissions and access changes, independent of the legacy flag", async () => {
      const operations = [
        {
          method: "GET",
          url: "/api/permissions",
          permission: "permissions.read",
        },
        {
          method: "GET",
          url: "/api/roles/2/permissions",
          permission: "roles.read",
        },
        {
          method: "PUT",
          url: "/api/roles/2/permissions",
          permission: "roles.permissions.update",
          payload: { permissions: [] },
        },
        {
          method: "PATCH",
          url: "/api/users/1/access",
          permission: "users.update",
          payload: { active: true },
        },
      ] as const;
      expect((await app.inject({ url: "/api/auth/me" })).statusCode).toBe(401);
      expect(
        (await app.inject({ url: "/api/auth/me", headers })).statusCode,
      ).toBe(200);
      for (const operation of operations) {
        const { permission, ...request } = operation;
        auth.credentials[0]!.permissions = [];
        expect((await app.inject(request)).statusCode).toBe(401);
        expect((await app.inject({ ...request, headers })).statusCode).toBe(
          403,
        );
        auth.credentials[0]!.permissions = [permission];
        expect((await app.inject({ ...request, headers })).statusCode).toBe(
          200,
        );
        auth.credentials[0]!.active = false;
        const blocked = await app.inject({ ...request, headers });
        expect(blocked.statusCode).toBe(401);
        expect(blocked.json()).toEqual({
          code: 401,
          message: "Invalid credentials or authentication token.",
          details: [],
        });
        auth.credentials[0]!.active = true;
      }
    });
  },
);
