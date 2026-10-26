import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "@/app.js";
import { RoleRepository } from "@/modules/roles/repositories/role.repository.js";
import { FakeRoleRepository } from "@/modules/roles/testing/fake-role.repository.js";
import { FakeUserRepository } from "@/modules/users/testing/fake-repositories.js";

describe("role routes", () => {
  let app: FastifyInstance;
  let roleRepository: FakeRoleRepository;

  beforeEach(() => {
    roleRepository = new FakeRoleRepository();
    app = buildApp({
      roleRepository,
      userRepository: new FakeUserRepository(),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("lists roles without pagination", async () => {
    const response = await app.inject({ method: "GET", url: "/api/roles" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      roleRepository.roles.map((role) => ({ ...role, permissions: [] })),
    );
  });

  it("creates, retrieves, updates and deletes a role over HTTP", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/roles",
      payload: { name: "  Analyst  ", description: "Reports" },
    });
    expect(created.statusCode).toBe(201);
    const role = created.json();
    expect(role).toEqual({
      permissions: [],
      id: 4,
      name: "Analyst",
      description: "Reports",
      created_at: "2026-09-18T12:00:00.000Z",
    });
    const url = `/api/roles/${role.id}`;
    const found = await app.inject({ method: "GET", url });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual(role);
    expect(
      (await app.inject({ method: "GET", url: "/api/roles" })).json(),
    ).toContainEqual(role);
    const updated = await app.inject({
      method: "PUT",
      url,
      payload: { name: "  Senior analyst  " },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({
      ...role,
      name: "Senior analyst",
      description: null,
    });
    const deleted = await app.inject({ method: "DELETE", url });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe("");
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
  });

  it("returns an empty list when there are no roles", async () => {
    roleRepository.roles = [];
    const response = await app.inject({ method: "GET", url: "/api/roles" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it.each([
    {},
    { name: "" },
    { name: "   " },
    { name: null },
    { name: 1 },
    { name: "a".repeat(51) },
    { name: "Analyst", description: "a".repeat(256) },
    { name: "Analyst", description: 1 },
  ])("validates create and update bodies: %j", async (payload) => {
    const before = structuredClone(roleRepository.roles);
    for (const method of ["POST", "PUT"] as const) {
      const response = await app.inject({
        method,
        url: method === "POST" ? "/api/roles" : "/api/roles/2",
        payload,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: 400,
        message: "Invalid data",
        details: expect.any(Array),
      });
      expect(response.json().details.length).toBeGreaterThan(0);
    }
    expect(roleRepository.roles).toEqual(before);
  });

  it.each(["0", "-1", "1.5", "abc", "2147483648", "Infinity"])(
    "validates IDs for all item routes: %s",
    async (id) => {
      for (const method of ["GET", "PUT", "DELETE"] as const) {
        const response = await app.inject({
          method,
          url: `/api/roles/${id}`,
          ...(method === "PUT" ? { payload: { name: "Analyst" } } : {}),
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
          code: 400,
          message: "Invalid data",
          details: expect.any(Array),
        });
      }
    },
  );

  it.each(["GET", "PUT", "DELETE"] as const)(
    "returns 404 for a missing role with %s",
    async (method) => {
      const response = await app.inject({
        method,
        url: "/api/roles/2147483647",
        ...(method === "PUT" ? { payload: { name: "Analyst" } } : {}),
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        code: 404,
        message: "Role not found.",
        details: [],
      });
    },
  );

  it("rejects duplicate names on create and update without changing roles", async () => {
    const before = structuredClone(roleRepository.roles);
    for (const method of ["POST", "PUT"] as const) {
      const response = await app.inject({
        method,
        url: method === "POST" ? "/api/roles" : "/api/roles/3",
        payload: { name: "  Manager  " },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        code: 409,
        message: "A role with this name already exists.",
        details: [],
      });
    }
    expect(roleRepository.roles).toEqual(before);
  });

  it("allows updating the same name and creating a name with different case", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/roles/2",
      payload: { name: "Manager", description: "Changed" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: 2, description: "Changed" });
    const created = await app.inject({
      method: "POST",
      url: "/api/roles",
      payload: { name: "manager" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: "manager",
      description: null,
    });
  });

  it.each([undefined, null, "", "d".repeat(255)])(
    "accepts valid optional descriptions: %j",
    async (description) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/roles",
        payload: {
          name: "n".repeat(50),
          ...(description === undefined ? {} : { description }),
        },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        name: "n".repeat(50),
        description: description ?? null,
      });
    },
  );

  it("returns 409 without removing a role referenced by users", async () => {
    roleRepository.referencedRoleIds.add(2);
    const response = await app.inject({
      method: "DELETE",
      url: "/api/roles/2",
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: 409,
      message: "The role cannot be deleted because it is referenced by a user.",
      details: [],
    });
    expect(await roleRepository.exists(2)).toBe(true);
  });

  it("hides unexpected database failures behind the existing error envelope", async () => {
    vi.spyOn(roleRepository, "create").mockRejectedValue(
      new Error("Connection unavailable"),
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/roles",
      payload: { name: "Analyst" },
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      code: 500,
      message: "Internal server error",
      details: [],
    });
  });
});

describe("RoleRepository", () => {
  it("lists roles ordered by id and serializes dates", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 1,
          name: "Administrator",
          description: null,
          created_at: new Date("2026-09-18T12:00:00.000Z"),
        },
      ],
    });
    const repository = new RoleRepository({ query } as unknown as Pool);

    const roles = await repository.findAll();

    expect(query.mock.calls[0]?.[0]).toContain("ORDER BY id ASC");
    expect(roles).toEqual([
      {
        id: 1,
        name: "Administrator",
        description: null,
        created_at: "2026-09-18T12:00:00.000Z",
      },
    ]);
  });

  it("checks whether a role exists", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const repository = new RoleRepository({ query } as unknown as Pool);

    await expect(repository.exists(2)).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(
      "SELECT 1 FROM roles WHERE id = $1",
      [2],
    );
  });
});
