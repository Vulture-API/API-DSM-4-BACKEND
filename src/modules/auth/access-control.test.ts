import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "@/app.js";
import type { AccessPolicy } from "@/modules/auth/access-control.js";
import { expectedAccessPolicies } from "@/modules/auth/testing/access-policy-matrix.js";
import { FakeAuthRepository } from "@/modules/auth/testing/fake-auth.repository.js";
import { PERMISSION_CODES } from "@/modules/permissions/permission-catalog.js";
import { FakeRoleRepository } from "@/modules/roles/testing/fake-role.repository.js";
import { FakeUserRepository } from "@/modules/users/testing/fake-repositories.js";

describe("route access policies", () => {
  let app: FastifyInstance;
  let auth: FakeAuthRepository;
  let users: FakeUserRepository;
  let roles: FakeRoleRepository;
  const query = vi.fn(() => {
    throw new Error("Unexpected business SQL");
  });
  const connect = vi.fn(() => {
    throw new Error("Unexpected business transaction");
  });
  const routes: { method: string; url: string; policy: AccessPolicy }[] = [];
  beforeEach(async () => {
    routes.length = 0;
    query.mockClear();
    connect.mockClear();
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
    users = new FakeUserRepository();
    roles = new FakeRoleRepository();
    app = buildApp({
      jwtSecret: "test-secret-scrum-432-access-control-only",
      accessControlEnabled: true,
      authRepository: auth,
      userRepository: users,
      roleRepository: roles,
      database: { query, connect } as unknown as Pool,
      rateLimits: { max: 10000 },
    });
    app.addHook("onRoute", (route) => {
      for (const method of Array.isArray(route.method)
        ? route.method
        : [route.method]) {
        if (route.config?.access)
          routes.push({
            method,
            url: route.url,
            policy: route.config.access,
          });
      }
    });
    await app.ready();
  });
  afterEach(async () => {
    await app.close();
  });

  it("matches every registered route, HEAD and alias to an independent permission matrix", () => {
    const expected = expectedAccessPolicies();
    const discovered = new Set<string>();
    for (const route of routes) {
      // Fastify also emits HEAD for collection paths ending in '/'.
      const path = route.url === "/" ? "/" : route.url.replace(/\/$/, "");
      const key = `${route.method} ${path}`;
      expect(route.policy, key).toEqual(expected.get(key));
      discovered.add(key);
    }
    expect([...discovered].sort()).toEqual([...expected.keys()].sort());
  });

  it("denies every protected route before validation or business work with identical 401/403 bodies", async () => {
    const operations = [
      vi.spyOn(users, "findAll"),
      vi.spyOn(users, "findById"),
      vi.spyOn(users, "create"),
      vi.spyOn(users, "update"),
      vi.spyOn(users, "updateAccess"),
      vi.spyOn(users, "delete"),
      vi.spyOn(roles, "findAll"),
      vi.spyOn(roles, "findById"),
      vi.spyOn(roles, "create"),
      vi.spyOn(roles, "update"),
      vi.spyOn(roles, "delete"),
      vi.spyOn(roles, "exists"),
      query,
      connect,
    ];
    const headers = { authorization: `Bearer ${app.jwt.sign({ sub: "1" })}` };
    for (const route of routes.filter(({ policy }) => policy.permission)) {
      expect(PERMISSION_CODES).toContain(route.policy.permission);
      const options = {
        method: route.method as
          "GET" | "POST" | "PUT" | "DELETE" | "HEAD" | "PATCH",
        url: route.url.replace(/:id/g, "invalid-id"),
        ...(route.method === "POST" ||
        route.method === "PUT" ||
        route.method === "PATCH"
          ? { payload: {} }
          : {}),
      };
      for (const state of [
        "anonymous",
        "invalid-token",
        "forbidden",
        "blocked",
      ] as const) {
        auth.credentials[0]!.active = state !== "blocked";
        const response = await app.inject({
          ...options,
          ...(state === "anonymous"
            ? {}
            : {
                headers:
                  state === "invalid-token"
                    ? { authorization: "Bearer invalid" }
                    : headers,
              }),
        });
        const status = state === "forbidden" ? 403 : 401;
        expect(
          response.statusCode,
          `${state}: ${route.method} ${route.url}`,
        ).toBe(status);
        if (route.method === "HEAD") expect(response.body).toBe("");
        else
          expect(response.json()).toEqual({
            code: status,
            message:
              status === 401
                ? "Invalid credentials or authentication token."
                : "You do not have permission to perform this action.",
            details: [],
          });
      }
    }
    for (const operation of operations)
      expect(operation).not.toHaveBeenCalled();
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
              route.policy.permission === `${resource}.${action}`,
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
