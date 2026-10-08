import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import { FakeRoleRepository } from "@/modules/roles/testing/fake-role.repository.js";
import { FakeUserRepository } from "@/modules/users/testing/fake-repositories.js";

describe("user and role routes", () => {
  let app: FastifyInstance;
  let userRepository: FakeUserRepository;
  let roleRepository: FakeRoleRepository;

  beforeEach(() => {
    userRepository = new FakeUserRepository();
    roleRepository = new FakeRoleRepository();
    app = buildApp({
      userRepository,
      roleRepository,
      passwordHasher: async (password) => `hashed:${password}`,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a normalized user and credential", async () => {
    const response = await createUser(app, {
      role_id: 1,
      name: "  Maria Silva  ",
      email: "  MARIA@EXAMPLE.COM ",
      password: "password123",
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: 1,
      role_id: 1,
      name: "Maria Silva",
      email: "maria@example.com",
      active: true,
      created_at: "2026-09-18T12:00:00.000Z",
    });
    expect(userRepository.passwordHashes).toEqual(["hashed:password123"]);
  });

  it("returns contract validation errors", async () => {
    const response = await createUser(app, {
      role_id: 0,
      name: "",
      email: "invalid",
      password: "short",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 400,
      message: "Invalid data",
      details: expect.any(Array),
    });
  });

  it("rejects duplicate emails", async () => {
    const payload = {
      role_id: 1,
      name: "Maria",
      email: "maria@example.com",
      password: "password123",
    };
    await createUser(app, payload);
    const response = await createUser(app, payload);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: 409,
      message: "A user with this email already exists.",
      details: [],
    });
  });

  it("rejects an unknown role", async () => {
    const response = await createUser(app, {
      role_id: 99,
      name: "Maria",
      email: "maria@example.com",
      password: "password123",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: 404,
      message: "Role not found.",
      details: [],
    });
  });

  it("lists users with pagination metadata", async () => {
    await createUser(app, {
      role_id: 1,
      name: "Maria",
      email: "maria@example.com",
      password: "password123",
    });
    await createUser(app, {
      role_id: 2,
      name: "Joao",
      email: "joao@example.com",
      password: "password123",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/users?page=2&limit=1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [{ id: 2, name: "Joao" }],
      meta: {
        total_records: 2,
        total_pages: 2,
        current_page: 2,
      },
    });
  });

  it("uses pagination defaults and supports empty pages", async () => {
    const firstPage = await app.inject({ method: "GET", url: "/api/users" });
    const emptyPage = await app.inject({
      method: "GET",
      url: "/api/users?page=3&limit=10",
    });

    expect(firstPage.statusCode).toBe(200);
    expect(firstPage.json()).toEqual({
      data: [],
      meta: { total_records: 0, total_pages: 0, current_page: 1 },
    });
    expect(emptyPage.statusCode).toBe(200);
    expect(emptyPage.json()).toEqual({
      data: [],
      meta: { total_records: 0, total_pages: 0, current_page: 3 },
    });
  });

  it("gets a user by id and returns 404 when absent", async () => {
    await createUser(app, {
      role_id: 1,
      name: "Maria",
      email: "maria@example.com",
      password: "password123",
    });

    const found = await app.inject({ method: "GET", url: "/api/users/1" });
    const absent = await app.inject({ method: "GET", url: "/api/users/2" });

    expect(found.statusCode).toBe(200);
    expect(found.json()).toMatchObject({ id: 1, email: "maria@example.com" });
    expect(absent.statusCode).toBe(404);
    expect(absent.json()).toEqual({
      code: 404,
      message: "User not found.",
      details: [],
    });
  });

  it("updates the user, role and active status without changing email", async () => {
    await createUser(app, {
      role_id: 1,
      name: "Maria",
      email: "maria@example.com",
      password: "password123",
    });

    const response = await app.inject({
      method: "PUT",
      url: "/api/users/1",
      payload: { role_id: 2, name: "  Maria Souza ", active: false },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 1,
      role_id: 2,
      name: "Maria Souza",
      email: "maria@example.com",
      active: false,
    });
  });

  it("deletes users and maps foreign key conflicts", async () => {
    await createUser(app, {
      role_id: 1,
      name: "Maria",
      email: "maria@example.com",
      password: "password123",
    });
    const deleted = await app.inject({ method: "DELETE", url: "/api/users/1" });
    const absent = await app.inject({ method: "DELETE", url: "/api/users/1" });

    userRepository.deleteError = { code: "23503" };
    const conflict = await app.inject({
      method: "DELETE",
      url: "/api/users/9",
    });

    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe("");
    expect(absent.statusCode).toBe(404);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({
      code: 409,
      message:
        "The user cannot be deleted because it is referenced by another resource.",
      details: [],
    });
  });

  it("does not expose legacy or unprefixed routes", async () => {
    const legacy = await app.inject({ method: "GET", url: "/api/usuarios" });
    const unprefixed = await app.inject({ method: "GET", url: "/users" });

    expect(legacy.statusCode).toBe(404);
    expect(unprefixed.statusCode).toBe(404);
  });
});

function createUser(app: FastifyInstance, payload: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/api/users", payload });
}
