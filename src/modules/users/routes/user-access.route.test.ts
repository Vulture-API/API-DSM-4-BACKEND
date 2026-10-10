import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "@/app.js";
import { FakeAuthRepository } from "@/modules/auth/testing/fake-auth.repository.js";
import { FakeRoleRepository } from "@/modules/roles/testing/fake-role.repository.js";
import { FakeUserRepository } from "@/modules/users/testing/fake-repositories.js";

const secret = "test-secret-scrum-433-access-state-only";
describe("PATCH user access (always protected)", () => {
  let app: FastifyInstance;
  let users: FakeUserRepository;
  let headers: { authorization: string };
  beforeEach(async () => {
    users = new FakeUserRepository();
    await users.create({
      roleId: 1,
      name: "Operator",
      email: "operator@example.com",
      passwordHash: "unchanged-operator-hash",
      active: true,
    });
    await users.create({
      roleId: 2,
      name: "Viewer",
      email: "viewer@example.com",
      passwordHash: "unchanged-viewer-hash",
      active: true,
    });
    const auth = new FakeAuthRepository();
    vi.spyOn(auth, "findUserById").mockImplementation(async (id) => {
      const user = await users.findById(id);
      return user
        ? {
            ...user,
            permissions:
              user.role_id === 1 ? ["users.update", "users.read"] : [],
          }
        : null;
    });
    app = buildApp({
      jwtSecret: secret,
      authRepository: auth,
      userRepository: users,
      roleRepository: new FakeRoleRepository(),
    });
    await app.ready();
    headers = { authorization: `Bearer ${app.jwt.sign({ sub: "1" })}` };
  });
  afterEach(async () => {
    await app.close();
  });

  it("blocks and unblocks only access, and accepts repeated commands", async () => {
    const initial = structuredClone(await users.findById(2));
    for (const active of [false, false, true, true]) {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/users/2/access",
        headers,
        payload: { active },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ...initial, active });
      expect((await app.inject({ url: "/api/users/2" })).json()).toEqual({
        ...initial,
        active,
      });
      const list = (await app.inject({ url: "/api/users" })).json();
      expect(
        list.data.find((user: { id: number }) => user.id === 2).active,
      ).toBe(active);
    }
    expect(users.passwordHashes).toEqual([
      "unchanged-operator-hash",
      "unchanged-viewer-hash",
    ]);
  });

  it.each([
    {},
    { active: null },
    { active: "false" },
    { active: 0 },
    { active: [] },
    { active: false, name: "Overwrite" },
    { active: false, role_id: 1 },
  ])(
    "rejects invalid bodies without changing the state: %j",
    async (payload) => {
      const update = vi.spyOn(users, "updateAccess");
      const response = await app.inject({
        method: "PATCH",
        url: "/api/users/2/access",
        headers,
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: 400,
        message: "Invalid data",
        details: expect.any(Array),
      });
      expect(update).not.toHaveBeenCalled();
      expect((await users.findById(2))!.active).toBe(true);
    },
  );

  it.each(["0", "-1", "1.5", "abc", "2147483648"])(
    "rejects invalid user IDs: %s",
    async (id) => {
      const update = vi.spyOn(users, "updateAccess");
      const response = await app.inject({
        method: "PATCH",
        url: `/api/users/${id}/access`,
        headers,
        payload: { active: false },
      });
      expect(response.statusCode).toBe(400);
      expect(update).not.toHaveBeenCalled();
    },
  );

  it("returns 404 for a missing user and hides unexpected persistence failures", async () => {
    const absent = await app.inject({
      method: "PATCH",
      url: "/api/users/2147483647/access",
      headers,
      payload: { active: false },
    });
    expect(absent.statusCode).toBe(404);
    expect(absent.json()).toEqual({
      code: 404,
      message: "User not found.",
      details: [],
    });
    vi.spyOn(users, "updateAccess").mockRejectedValueOnce(
      new Error("Database unavailable"),
    );
    const failed = await app.inject({
      method: "PATCH",
      url: "/api/users/2/access",
      headers,
      payload: { active: false },
    });
    expect(failed.statusCode).toBe(500);
    expect(failed.json()).toEqual({
      code: 500,
      message: "Internal server error",
      details: [],
    });
    expect((await users.findById(2))!.active).toBe(true);
  });

  it("requires authentication and users.update even with legacy protection disabled", async () => {
    const update = vi.spyOn(users, "updateAccess");
    const request = {
      method: "PATCH" as const,
      url: "/api/users/2/access",
      payload: { active: false },
    };
    expect((await app.inject(request)).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          ...request,
          headers: { authorization: `Bearer ${app.jwt.sign({ sub: "2" })}` },
        })
      ).statusCode,
    ).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("denies a previously issued token while blocked and accepts it again after unblock", async () => {
    const viewerHeaders = {
      authorization: `Bearer ${app.jwt.sign({ sub: "2" })}`,
    };
    expect(
      (await app.inject({ url: "/api/auth/me", headers: viewerHeaders }))
        .statusCode,
    ).toBe(200);
    await app.inject({
      method: "PATCH",
      url: "/api/users/2/access",
      headers,
      payload: { active: false },
    });
    expect(
      (await app.inject({ url: "/api/auth/me", headers: viewerHeaders }))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/api/users/2/access",
          headers: viewerHeaders,
          payload: { active: true },
        })
      ).statusCode,
    ).toBe(401);
    await app.inject({
      method: "PATCH",
      url: "/api/users/2/access",
      headers,
      payload: { active: true },
    });
    expect(
      (await app.inject({ url: "/api/auth/me", headers: viewerHeaders }))
        .statusCode,
    ).toBe(200);
  });

  it("applies rate limiting before the state is changed", async () => {
    const limited = buildApp({
      jwtSecret: secret,
      authRepository: new FakeAuthRepository(),
      userRepository: users,
      roleRepository: new FakeRoleRepository(),
      rateLimits: { max: 1 },
    });
    try {
      const update = vi.spyOn(users, "updateAccess");
      const request = {
        method: "PATCH" as const,
        url: "/api/users/2/access",
        payload: { active: false },
      };
      expect((await limited.inject(request)).statusCode).toBe(401);
      const rejected = await limited.inject(request);
      expect(rejected.statusCode).toBe(429);
      expect(rejected.headers["retry-after"]).toBeDefined();
      expect(update).not.toHaveBeenCalled();
    } finally {
      await limited.close();
    }
  });
});
