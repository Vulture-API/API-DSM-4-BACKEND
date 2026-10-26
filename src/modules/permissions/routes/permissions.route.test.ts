import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "@/app.js";
import { FakeAuthRepository } from "@/modules/auth/testing/fake-auth.repository.js";
import {
  PERMISSION_CODES,
  PERMISSIONS,
} from "@/modules/permissions/permission-catalog.js";
import { FakePermissionRepository } from "@/modules/permissions/testing/fake-permission.repository.js";
import { FakeRoleRepository } from "@/modules/roles/testing/fake-role.repository.js";
import { FakeUserRepository } from "@/modules/users/testing/fake-repositories.js";

const secret = "test-secret-scrum-432-permissions-only";
describe("permissions routes (always protected)", () => {
  let app: FastifyInstance;
  let repository: FakePermissionRepository;
  let auth: FakeAuthRepository;
  let headers: { authorization: string };
  beforeEach(async () => {
    const roles = new FakeRoleRepository();
    repository = new FakePermissionRepository(roles);
    repository.grants.set(1, [...PERMISSION_CODES]);
    auth = new FakeAuthRepository();
    auth.credentials = [1, 2].map((id) => ({
      id,
      role_id: id,
      name: `User ${id}`,
      email: `user${id}@example.com`,
      active: true,
      created_at: "2026-10-10T00:00:00.000Z",
      password_hash: "unused",
      permissions: [],
    }));
    const findUser = auth.findUserById.bind(auth);
    vi.spyOn(auth, "findUserById").mockImplementation(async (id) => {
      const user = await findUser(id);
      return user
        ? {
            ...user,
            permissions: (await repository.findByRoleId(user.role_id)) ?? [],
          }
        : null;
    });
    app = buildApp({
      jwtSecret: secret,
      authRepository: auth,
      roleRepository: roles,
      permissionRepository: repository,
      userRepository: new FakeUserRepository(),
    });
    await app.ready();
    headers = { authorization: `Bearer ${app.jwt.sign({ sub: "1" })}` };
  });
  afterEach(async () => {
    await app.close();
  });

  it("lists the fixed catalog, replaces grants, returns them on profiles and clears them", async () => {
    const catalog = await app.inject({ url: "/api/permissions", headers });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json()).toEqual(PERMISSIONS);
    const updated = await app.inject({
      method: "PUT",
      url: "/api/roles/2/permissions",
      headers,
      payload: { permissions: ["users.read", "stations.create"] },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({
      role_id: 2,
      permissions: ["stations.create", "users.read"],
    });
    expect(
      (await app.inject({ url: "/api/roles/2/permissions", headers })).json(),
    ).toEqual(updated.json());
    expect(
      (await app.inject({ url: "/api/roles/2" })).json().permissions,
    ).toEqual(updated.json().permissions);
    const list = vi.spyOn(repository, "findByRoleIds");
    expect(
      (await app.inject({ url: "/api/roles" })).json()[1].permissions,
    ).toEqual(updated.json().permissions);
    expect(list).toHaveBeenCalledOnce();
    const edited = await app.inject({
      method: "PUT",
      url: "/api/roles/2",
      payload: { name: "Changed name" },
    });
    expect(edited.json().permissions).toEqual(updated.json().permissions);
    const created = await app.inject({
      method: "POST",
      url: "/api/roles",
      payload: { name: "New role" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().permissions).toEqual([]);
    const cleared = await app.inject({
      method: "PUT",
      url: "/api/roles/2/permissions",
      headers,
      payload: { permissions: [] },
    });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().permissions).toEqual([]);
  });

  it.each([
    {},
    { permissions: null },
    { permissions: "users.read" },
    { permissions: ["unknown"] },
    { permissions: ["users.read", "users.read"] },
  ])("rejects invalid grants without changing data: %j", async (payload) => {
    repository.grants.set(2, ["users.read"]);
    const response = await app.inject({
      method: "PUT",
      url: "/api/roles/2/permissions",
      headers,
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(repository.grants.get(2)).toEqual(["users.read"]);
  });

  it("requires authentication and the configured capability even when legacy protection is off", async () => {
    const low = { authorization: `Bearer ${app.jwt.sign({ sub: "2" })}` };
    for (const [method, url] of [
      ["GET", "/api/permissions"],
      ["GET", "/api/roles/2/permissions"],
      ["PUT", "/api/roles/2/permissions"],
    ] as const) {
      const options = {
        method,
        url,
        ...(method === "PUT" ? { payload: { permissions: [] } } : {}),
      };
      expect((await app.inject(options)).statusCode).toBe(401);
      expect((await app.inject({ ...options, headers: low })).statusCode).toBe(
        403,
      );
    }
    repository.grants.set(1, []);
    expect(
      (await app.inject({ url: "/api/permissions", headers })).statusCode,
    ).toBe(403);
    expect((await app.inject({ url: "/api/roles" })).statusCode).toBe(200);
  });

  it("returns current effective grants and rejects missing profiles", async () => {
    repository.grants.set(2, ["monitoring.read"]);
    const me = await app.inject({
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${app.jwt.sign({ sub: "2" })}` },
    });
    expect(me.json().permissions).toEqual(["monitoring.read"]);
    for (const method of ["GET", "PUT"] as const) {
      expect(
        (
          await app.inject({
            method,
            url: "/api/roles/999/permissions",
            headers,
            ...(method === "PUT" ? { payload: { permissions: [] } } : {}),
          })
        ).statusCode,
      ).toBe(404);
    }
    expect(
      (await app.inject({ url: "/api/roles/0/permissions", headers }))
        .statusCode,
    ).toBe(400);
  });
});
