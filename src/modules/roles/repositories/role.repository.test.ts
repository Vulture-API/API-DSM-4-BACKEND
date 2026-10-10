import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  RoleDeletionConflictError,
  RoleNameConflictError,
} from "@/modules/roles/errors/role.errors.js";
import { RoleRepository } from "@/modules/roles/repositories/role.repository.js";

const row = {
  id: 4,
  name: "Analyst",
  description: null,
  created_at: "2026-09-18T12:00:00.000Z",
};
const input = { name: "Analyst", description: null };

function setup(result: { rows?: unknown[]; rowCount?: number | null } = {}) {
  const query = vi.fn().mockResolvedValue(result);
  return {
    query,
    repository: new RoleRepository({ query } as unknown as Pool),
  };
}

describe("RoleRepository mutations", () => {
  it("persists a role with parameters and serializes dates", async () => {
    const { query, repository } = setup({
      rows: [{ ...row, created_at: new Date(row.created_at) }],
    });
    expect(await repository.create(input)).toEqual(row);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO roles"),
      ["Analyst", null],
    );
  });

  it("retrieves and updates a role with parameters", async () => {
    const { query, repository } = setup({ rows: [row] });
    expect(await repository.findById(4)).toEqual(row);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("WHERE id = $1"),
      [4],
    );
    expect(await repository.update(4, input)).toEqual(row);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("UPDATE roles"),
      [4, "Analyst", null],
    );
  });

  it("returns missing results without fabricating a role", async () => {
    const { repository } = setup({ rows: [], rowCount: null });
    expect(await repository.findById(999)).toBeNull();
    expect(await repository.update(999, input)).toBeNull();
    expect(await repository.delete(999)).toBe(false);
    expect(await repository.exists(999)).toBe(false);
  });

  it("deletes only the requested role", async () => {
    const { query, repository } = setup({ rowCount: 1 });
    expect(await repository.delete(4)).toBe(true);
    expect(query).toHaveBeenCalledWith("DELETE FROM roles WHERE id = $1", [4]);
  });

  it("translates database conflicts", async () => {
    const { query, repository } = setup();
    query.mockRejectedValue({ code: "23505" });
    await expect(repository.create(input)).rejects.toBeInstanceOf(
      RoleNameConflictError,
    );
    await expect(repository.update(4, input)).rejects.toBeInstanceOf(
      RoleNameConflictError,
    );
    query.mockRejectedValue({ code: "23503" });
    await expect(repository.delete(4)).rejects.toBeInstanceOf(
      RoleDeletionConflictError,
    );
    query.mockRejectedValue({ code: "23001" });
    await expect(repository.delete(4)).rejects.toBeInstanceOf(
      RoleDeletionConflictError,
    );
  });

  it.each([
    new Error("Connection unavailable"),
    { code: "08006" },
    null,
    "failure",
  ])("propagates unexpected failures: %j", async (error) => {
    const { query, repository } = setup();
    query.mockRejectedValue(error);
    await expect(repository.create(input)).rejects.toBe(error);
    await expect(repository.update(4, input)).rejects.toBe(error);
    await expect(repository.delete(4)).rejects.toBe(error);
  });
});
