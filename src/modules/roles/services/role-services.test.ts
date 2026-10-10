import { describe, expect, it } from "vitest";

import {
  RoleDeletionConflictError,
  RoleNameConflictError,
  RoleNotFoundError,
} from "@/modules/roles/errors/role.errors.js";
import { CreateRoleService } from "@/modules/roles/services/create-role.service.js";
import { DeleteRoleService } from "@/modules/roles/services/delete-role.service.js";
import { GetRoleService } from "@/modules/roles/services/get-role.service.js";
import { ListRolesService } from "@/modules/roles/services/list-roles.service.js";
import { UpdateRoleService } from "@/modules/roles/services/update-role.service.js";
import { FakeRoleRepository } from "@/modules/roles/testing/fake-role.repository.js";
import { RoleNotFoundError as UserRoleNotFoundError } from "@/modules/users/errors/user.errors.js";

describe("role services", () => {
  it("creates, lists, retrieves, updates and deletes a role", async () => {
    const repository = new FakeRoleRepository();
    const created = await new CreateRoleService(repository).create({
      name: "Analyst",
      description: "Read reports",
    });
    expect(await new ListRolesService(repository).list()).toContainEqual(
      created,
    );
    expect(await new GetRoleService(repository).get(created.id)).toEqual(
      created,
    );
    const updated = await new UpdateRoleService(repository).update(created.id, {
      name: "Senior analyst",
      description: null,
    });
    expect(updated).toEqual({
      ...created,
      name: "Senior analyst",
      description: null,
    });
    await new DeleteRoleService(repository).delete(created.id);
    expect(await repository.exists(created.id)).toBe(false);
  });

  it("returns not found for missing roles and preserves users error compatibility", async () => {
    const repository = new FakeRoleRepository();
    expect(UserRoleNotFoundError).toBe(RoleNotFoundError);
    await expect(
      new GetRoleService(repository).get(999),
    ).rejects.toBeInstanceOf(RoleNotFoundError);
    await expect(
      new UpdateRoleService(repository).update(999, {
        name: "Missing",
        description: null,
      }),
    ).rejects.toBeInstanceOf(RoleNotFoundError);
    await expect(
      new DeleteRoleService(repository).delete(999),
    ).rejects.toBeInstanceOf(RoleNotFoundError);
  });

  it("rejects duplicate names on create and update but allows the same role name", async () => {
    const repository = new FakeRoleRepository();
    await expect(
      new CreateRoleService(repository).create({
        name: "Manager",
        description: null,
      }),
    ).rejects.toBeInstanceOf(RoleNameConflictError);
    await expect(
      new UpdateRoleService(repository).update(3, {
        name: "Manager",
        description: null,
      }),
    ).rejects.toBeInstanceOf(RoleNameConflictError);
    await expect(
      new UpdateRoleService(repository).update(2, {
        name: "Manager",
        description: "Changed",
      }),
    ).resolves.toMatchObject({ id: 2, description: "Changed" });
    await expect(
      new CreateRoleService(repository).create({
        name: "manager",
        description: null,
      }),
    ).resolves.toMatchObject({ name: "manager" });
  });

  it("preserves referenced roles when deletion is refused", async () => {
    const repository = new FakeRoleRepository();
    repository.referencedRoleIds.add(2);
    await expect(
      new DeleteRoleService(repository).delete(2),
    ).rejects.toBeInstanceOf(RoleDeletionConflictError);
    expect(await repository.exists(2)).toBe(true);
  });
});
