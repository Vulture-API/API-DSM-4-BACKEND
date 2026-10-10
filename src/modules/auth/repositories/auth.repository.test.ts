import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { PgAuthRepository } from "@/modules/auth/repositories/auth.repository.js";

describe("PgAuthRepository", () => {
  it("queries credentials and current permissions with parameterized identity", async () => {
    const row = {
      id: 1,
      role_id: 1,
      name: "Test",
      active: true,
      email: "test@example.com",
      password_hash: "hash",
      permissions: ["users.read"],
      created_at: new Date("2026-10-10T00:00:00Z"),
    };
    const query = vi.fn().mockResolvedValue({ rows: [row] });
    const repository = new PgAuthRepository({ query } as unknown as Pool);
    expect(await repository.findCredentialByEmail(row.email)).toEqual({
      ...row,
      created_at: "2026-10-10T00:00:00.000Z",
    });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("c.email = $1"),
      [row.email],
    );
    const { password_hash: _hash, ...user } = row;
    query.mockResolvedValue({ rows: [user] });
    expect(await repository.findUserById(1)).toMatchObject({
      id: 1,
      permissions: ["users.read"],
    });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("u.id = $1"),
      [1],
    );
    query.mockResolvedValue({ rows: [] });
    expect(await repository.findUserById(999)).toBeNull();
    expect(
      await repository.findCredentialByEmail("missing@example.com"),
    ).toBeNull();
  });
});
