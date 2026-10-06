import { describe, expect, it, vi } from "vitest";

import { FakeRoleRepository } from "@/modules/roles/testing/fake-role.repository.js";
import {
  EmailAlreadyExistsError,
  RoleNotFoundError,
  UserNotFoundError,
} from "@/modules/users/errors/user.errors.js";
import type { UserRepositoryPort } from "@/modules/users/repositories/user.repository.js";
import { CreateUserService } from "@/modules/users/services/create-user.service.js";
import { UpdateUserService } from "@/modules/users/services/update-user.service.js";
import { FakeUserRepository } from "@/modules/users/testing/fake-repositories.js";

describe("user services", () => {
  it("hashes the password before persisting a user", async () => {
    const users = new FakeUserRepository();
    const roles = new FakeRoleRepository();
    const hasher = vi.fn(async () => "scrypt$hash");
    const service = new CreateUserService(users, roles, hasher);

    await service.create({
      role_id: 1,
      name: "Maria",
      email: "maria@example.com",
      password: "password123",
      active: true,
    });

    expect(hasher).toHaveBeenCalledWith("password123");
    expect(users.passwordHashes).toEqual(["scrypt$hash"]);
  });

  it("maps unique violations to an email conflict", async () => {
    const users = new FakeUserRepository();
    const roles = new FakeRoleRepository();
    const service = new CreateUserService(users, roles, async () => "hash");
    const input = {
      role_id: 1,
      name: "Maria",
      email: "maria@example.com",
      password: "password123",
      active: true,
    };

    await service.create(input);

    await expect(service.create(input)).rejects.toBeInstanceOf(
      EmailAlreadyExistsError,
    );
  });

  it("checks roles before create and update", async () => {
    const users = new FakeUserRepository();
    const roles = new FakeRoleRepository();
    const createService = new CreateUserService(
      users,
      roles,
      async () => "hash",
    );
    const updateService = new UpdateUserService(users, roles);

    await expect(
      createService.create({
        role_id: 99,
        name: "Maria",
        email: "maria@example.com",
        password: "password123",
        active: true,
      }),
    ).rejects.toBeInstanceOf(RoleNotFoundError);
    await expect(
      updateService.update(1, { role_id: 99, name: "Maria", active: true }),
    ).rejects.toBeInstanceOf(RoleNotFoundError);
  });

  it("returns not found when updating an absent user", async () => {
    const service = new UpdateUserService(
      new FakeUserRepository(),
      new FakeRoleRepository(),
    );

    await expect(
      service.update(1, { role_id: 1, name: "Maria", active: true }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it("maps a role foreign key race during creation", async () => {
    const users = {
      create: vi.fn().mockRejectedValue({ code: "23503" }),
    } as unknown as UserRepositoryPort;
    const service = new CreateUserService(
      users,
      new FakeRoleRepository(),
      async () => "hash",
    );

    await expect(
      service.create({
        role_id: 1,
        name: "Maria",
        email: "maria@example.com",
        password: "password123",
        active: true,
      }),
    ).rejects.toBeInstanceOf(RoleNotFoundError);
  });
});
