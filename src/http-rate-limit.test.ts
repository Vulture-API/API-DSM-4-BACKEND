import { Socket } from "node:net";

import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "@/app.js";
import { FakeAuthRepository } from "@/modules/auth/testing/fake-auth.repository.js";
import { InMemoryMonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import { FakeRoleRepository } from "@/modules/roles/testing/fake-role.repository.js";
import { FakeUserRepository } from "@/modules/users/testing/fake-repositories.js";

const secret = "test-secret-scrum-432-rate-limit-only";
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.useRealTimers();
});

async function setup(max = 2, window = 60000, loginMax = 2, enabled = true) {
  const auth = new FakeAuthRepository();
  auth.credentials.push({
    id: 1,
    role_id: 1,
    name: "Test",
    email: "test@example.com",
    active: true,
    created_at: "2026-10-10T00:00:00.000Z",
    password_hash: "invalid",
    permissions: ["users.read", "monitoring.read"],
  });
  const users = new FakeUserRepository();
  const roles = new FakeRoleRepository();
  const app = buildApp({
    jwtSecret: secret,
    accessControlEnabled: enabled,
    authRepository: auth,
    userRepository: users,
    roleRepository: roles,
    monitoringRepository: new InMemoryMonitoringRepository(),
    rateLimits: { max, loginMax, timeWindowMs: window },
  });
  apps.push(app);
  await app.ready();
  const headers = { authorization: `Bearer ${app.jwt.sign({ sub: "1" })}` };
  return { app, auth, users, roles, headers };
}

describe("HTTP request limits", () => {
  it("rejects requests before authentication and database work, with a budget shared by routes and methods", async () => {
    const { app, auth, users, roles, headers } = await setup();
    const authenticate = vi.spyOn(auth, "findUserById");
    const readUsers = vi.spyOn(users, "findAll");
    const readRoles = vi.spyOn(roles, "findAll");
    expect((await app.inject({ url: "/api/users", headers })).statusCode).toBe(
      200,
    );
    expect(
      (await app.inject({ method: "HEAD", url: "/api/users", headers }))
        .statusCode,
    ).toBe(200);
    const blocked = await app.inject({
      url: "/api/roles?nonce=different",
      headers,
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({
      code: 429,
      message: "Too many requests. Please try again later.",
      details: [],
    });
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.headers["x-ratelimit-limit"]).toBe("2");
    expect(authenticate).toHaveBeenCalledTimes(2);
    expect(readUsers).toHaveBeenCalledTimes(2);
    expect(readRoles).not.toHaveBeenCalled();
  });

  it("limits login before credential lookup and scrypt, without consuming the API budget", async () => {
    const { app, auth, headers } = await setup(1, 60000, 2);
    const query = vi.spyOn(auth, "findCredentialByEmail");
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/auth/login",
            payload: { email: "test@example.com", password: "wrong" },
          })
        ).statusCode,
      ).toBe(401);
    }
    const blocked = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "different@example.com", password: "another" },
    });
    expect(blocked.statusCode).toBe(429);
    expect(query).toHaveBeenCalledTimes(2);
    expect((await app.inject({ url: "/api/users", headers })).statusCode).toBe(
      200,
    );
    expect((await app.inject({ url: "/api/users", headers })).statusCode).toBe(
      429,
    );
  });

  it("keeps healthchecks and preflight available after exhaustion", async () => {
    const { app, headers } = await setup(1);
    await app.inject({ url: "/api/users", headers });
    for (const url of ["/", "/health", "/api/health", "/api/v1/health"]) {
      expect((await app.inject({ url })).statusCode).toBe(200);
    }
    expect(
      (await app.inject({ method: "OPTIONS", url: "/api/sensors" })).statusCode,
    ).toBe(204);
    expect((await app.inject({ url: "/api/users", headers })).statusCode).toBe(
      429,
    );
  });

  it("isolates client IPs and ignores spoofed forwarding headers", async () => {
    const { app, headers } = await setup(1);
    const client = {
      remoteAddress: "198.51.100.10",
      url: "/api/users",
      headers: { ...headers, "x-forwarded-for": "203.0.113.1" },
    };
    expect((await app.inject(client)).statusCode).toBe(200);
    expect(
      (
        await app.inject({
          ...client,
          headers: { ...headers, "x-forwarded-for": "203.0.113.2" },
        })
      ).statusCode,
    ).toBe(429);
    expect(
      (await app.inject({ ...client, remoteAddress: "198.51.100.20" }))
        .statusCode,
    ).toBe(200);
  });

  it("shares limits across sensor aliases even with access control disabled", async () => {
    const { app } = await setup(2, 60000, 2, false);
    expect((await app.inject({ url: "/sensors" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/v1/sensors" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/v1/sensor-types" })).statusCode).toBe(
      429,
    );
  });

  it("resets the budget after the configured window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { app, headers } = await setup(1, 1000);
    expect((await app.inject({ url: "/api/users", headers })).statusCode).toBe(
      200,
    );
    expect((await app.inject({ url: "/api/users", headers })).statusCode).toBe(
      429,
    );
    vi.setSystemTime(Date.now() + 1001);
    expect((await app.inject({ url: "/api/users", headers })).statusCode).toBe(
      200,
    );
  });

  it("limits WebSocket upgrades before authorization lookup", async () => {
    const { app, auth, headers } = await setup(1);
    const query = vi.spyOn(auth, "findUserById");
    await app.inject({ url: "/api/users", headers });
    const socket = new Socket();
    Object.defineProperty(socket, "remoteAddress", { value: "127.0.0.1" });
    await expect(
      app.injectWS("/api/stations/current/ws", { headers, socket }),
    ).rejects.toThrow("429");
    socket.destroy();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("preserves the global error envelope for limited monitoring routes", async () => {
    const { app, headers } = await setup(1);
    expect(
      (await app.inject({ url: "/api/stations/current", headers })).statusCode,
    ).toBe(200);
    const limited = await app.inject({
      url: "/api/stations/overview",
      headers,
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({
      statusCode: 429,
      code: "RATE_LIMIT_EXCEEDED",
    });
  });

  it("rejects invalid injected limits", () => {
    expect(() => buildApp({ rateLimits: { max: 0 } })).toThrow("Rate limits");
    expect(() => buildApp({ rateLimits: { timeWindowMs: -1 } })).toThrow(
      "Rate limits",
    );
  });
});
