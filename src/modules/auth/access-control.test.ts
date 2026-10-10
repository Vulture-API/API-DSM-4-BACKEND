import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import { FakeAuthRepository } from "@/modules/auth/testing/fake-auth.repository.js";
import { PERMISSION_CODES } from "@/modules/permissions/permission-catalog.js";
import { FakeRoleRepository } from "@/modules/roles/testing/fake-role.repository.js";
import { FakeUserRepository } from "@/modules/users/testing/fake-repositories.js";

describe("route access policies", () => {
  let app: FastifyInstance;
  let auth: FakeAuthRepository;
  const routes: { method: string; url: string; permission: string }[] = [];
  beforeEach(async () => {
    routes.length = 0;
    auth = new FakeAuthRepository();
    auth.credentials.push({
      id: 1,
      role_id: 1,
      name: "Administrator",
      email: "test@example.com",
      active: true,
      created_at: "2026-10-10T00:00:00.000Z",
      password_hash: "unused",
      permissions: [],
    });
    app = buildApp({
      jwtSecret: "test-secret-scrum-432-access-control-only",
      accessControlEnabled: true,
      authRepository: auth,
      userRepository: new FakeUserRepository(),
      roleRepository: new FakeRoleRepository(),
    });
    app.addHook("onRoute", (route) => {
      for (const method of Array.isArray(route.method)
        ? route.method
        : [route.method]) {
        if (route.config?.access?.permission)
          routes.push({
            method,
            url: route.url,
            permission: route.config.access.permission,
          });
      }
    });
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });

  it("denies all discovered business routes and aliases before validation or business operations", async () => {
    expect(routes.length).toBeGreaterThan(70);
    const headers = { authorization: `Bearer ${app.jwt.sign({ sub: "1" })}` };
    for (const route of routes) {
      expect(PERMISSION_CODES).toContain(route.permission);
      const options = {
        method: route.method as "GET" | "POST" | "PUT" | "DELETE" | "HEAD",
        url: route.url.replace(/:id/g, "1"),
        ...(route.method === "POST" || route.method === "PUT"
          ? { payload: {} }
          : {}),
      };
      expect(
        (await app.inject(options)).statusCode,
        `${route.method} ${route.url}`,
      ).toBe(401);
      expect(
        (await app.inject({ ...options, headers })).statusCode,
        `${route.method} ${route.url}`,
      ).toBe(403);
    }
    expect(
      (await app.inject({ method: "POST", url: "/internal/rules-engine/run" }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/internal/rules-engine/run",
          headers,
        })
      ).statusCode,
    ).toBe(403);
  });

  it("maps CRUD actions explicitly and keeps public endpoints reachable", async () => {
    for (const resource of [
      "users",
      "roles",
      "stations",
      "sensors",
      "sensor-types",
    ]) {
      for (const [method, action] of [
        ["GET", "read"],
        ["POST", "create"],
        ["PUT", "update"],
        ["DELETE", "delete"],
      ]) {
        expect(
          routes.some(
            (route) =>
              route.method === method &&
              route.permission === `${resource}.${action}`,
          ),
        ).toBe(true);
      }
    }
    for (const url of ["/", "/health", "/api/health", "/api/v1/health"])
      expect((await app.inject({ url })).statusCode).toBe(200);
    for (const prefix of ["", "/api", "/v1", "/api/v1"])
      expect(
        (await app.inject({ method: "OPTIONS", url: `${prefix}/sensors` }))
          .statusCode,
      ).toBe(204);
    const fresh = buildApp();
    try {
      expect(() => fresh.get("/unclassified", async () => ({}))).toThrow(
        "Missing access policy",
      );
    } finally {
      await fresh.close();
    }
  });

  it("uses live grants rather than role names or permissions in JWT claims", async () => {
    const token = app.jwt.sign({
      sub: "1",
      permissions: ["users.read"],
      role_id: 1,
    });
    const headers = { authorization: `Bearer ${token}` };
    expect((await app.inject({ url: "/api/users", headers })).statusCode).toBe(
      403,
    );
    auth.credentials[0]!.permissions = ["users.read"];
    expect((await app.inject({ url: "/api/users", headers })).statusCode).toBe(
      200,
    );
    expect(
      (await app.inject({ method: "HEAD", url: "/api/users", headers }))
        .statusCode,
    ).toBe(200);
    auth.credentials[0]!.permissions = [];
    expect((await app.inject({ url: "/api/users", headers })).statusCode).toBe(
      403,
    );
    auth.credentials[0]!.active = false;
    expect((await app.inject({ url: "/api/users", headers })).statusCode).toBe(
      401,
    );
  });
});
