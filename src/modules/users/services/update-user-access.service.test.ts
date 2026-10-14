import { describe, expect, it, vi } from "vitest";

import { UserNotFoundError } from "@/modules/users/errors/user.errors.js";
import { UpdateUserAccessService } from "@/modules/users/services/update-user-access.service.js";
import { FakeUserRepository } from "@/modules/users/testing/fake-repositories.js";

describe("UpdateUserAccessService", () => {
  it("blocks and unblocks without replacing unrelated fields or credentials", async () => {
    const repository = new FakeUserRepository();
    const user = await repository.create({
      roleId: 2,
      name: "Test",
      email: "test@example.com",
      passwordHash: "unchanged-hash",
      active: true,
    });
    const service = new UpdateUserAccessService(repository);
    expect(await service.update(user.id, { active: false })).toEqual({
      ...user,
      active: false,
    });
    expect(await repository.findById(user.id)).toEqual({
      ...user,
      active: false,
    });
    expect(await service.update(user.id, { active: false })).toEqual({
      ...user,
      active: false,
    });
    expect(await service.update(user.id, { active: true })).toEqual(user);
    expect(await service.update(user.id, { active: true })).toEqual(user);
    expect(repository.passwordHashes).toEqual(["unchanged-hash"]);
  });

  it("reports missing users and propagates persistence failures", async () => {
    const repository = new FakeUserRepository();
    const service = new UpdateUserAccessService(repository);
    await expect(service.update(999, { active: false })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    const error = new Error("Database unavailable");
    vi.spyOn(repository, "updateAccess").mockRejectedValueOnce(error);
    await expect(service.update(1, { active: false })).rejects.toBe(error);
  });
});
