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

  it("lists the fixed roles", async () => {
    const response = await app.inject({ method: "GET", url: "/api/roles" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(roleRepository.roles);
  });

  it("does not expose role mutation routes", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/roles",
      payload: { name: "New role" },
    });

    expect(response.statusCode).toBe(404);
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
