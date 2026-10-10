import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { PgPermissionRepository } from "@/modules/permissions/repositories/permission.repository.js";
import { RoleNotFoundError } from "@/modules/roles/errors/role.errors.js";

describe("PgPermissionRepository", () => {
  it("queries catalog and role grants in bulk, including empty and missing results", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ code: "users.read", description: "Read users" }],
    });
    const repository = new PgPermissionRepository({ query } as unknown as Pool);
    expect(await repository.list()).toEqual([
      { code: "users.read", description: "Read users" },
    ]);
    query.mockResolvedValue({ rows: [{ permissions: [] }] });
    expect(await repository.findByRoleId(1)).toEqual([]);
    query.mockResolvedValue({ rows: [] });
    expect(await repository.findByRoleId(999)).toBeNull();
    query.mockClear();
    expect(await repository.findByRoleIds([])).toEqual(new Map());
    expect(query).not.toHaveBeenCalled();
    query.mockResolvedValue({
      rows: [{ role_id: 2, permissions: ["users.read"] }],
    });
    expect(await repository.findByRoleIds([1, 2])).toEqual(
      new Map([[2, ["users.read"]]]),
    );
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("ANY($1::int[])"),
      [[1, 2]],
    );
  });
  it("locks the role and replaces grants in one transaction", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rowCount: 2 })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1 });
    const release = vi.fn();
    const repository = new PgPermissionRepository({
      connect: async () => ({ query, release }) as unknown as PoolClient,
    } as unknown as Pool);
    expect(
      await repository.replace(2, ["users.read", "stations.read"]),
    ).toEqual(["stations.read", "users.read"]);
    expect(query.mock.calls[0]?.[0]).toBe("BEGIN");
    expect(query.mock.calls[1]?.[0]).toContain("FOR UPDATE");
    expect(query.mock.calls[3]?.[0]).toContain("DELETE FROM role_permissions");
    expect(query.mock.calls[4]?.[1]).toEqual([
      2,
      ["users.read", "stations.read"],
    ]);
    expect(query.mock.calls[5]?.[0]).toBe("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });
  it.each(["missing", "unknown", "duplicate", "database error"])(
    "rolls back and releases on %s",
    async (kind) => {
      const query = vi.fn().mockResolvedValue({ rowCount: 1 });
      if (kind === "missing")
        query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 0 });
      if (kind === "unknown")
        query
          .mockResolvedValueOnce({})
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockResolvedValueOnce({ rowCount: 0 });
      if (kind === "database error")
        query
          .mockResolvedValueOnce({})
          .mockRejectedValueOnce(new Error("Unavailable"));
      const release = vi.fn();
      const repository = new PgPermissionRepository({
        connect: async () => ({ query, release }) as unknown as PoolClient,
      } as unknown as Pool);
      const request = repository.replace(
        2,
        kind === "duplicate" ? ["users.read", "users.read"] : ["users.read"],
      );
      if (kind === "missing")
        await expect(request).rejects.toBeInstanceOf(RoleNotFoundError);
      else await expect(request).rejects.toBeInstanceOf(Error);
      expect(query).toHaveBeenLastCalledWith("ROLLBACK");
      expect(release).toHaveBeenCalledOnce();
      expect(
        query.mock.calls.some(
          ([sql]) => typeof sql === "string" && sql.includes("DELETE FROM"),
        ),
      ).toBe(false);
    },
  );
});
