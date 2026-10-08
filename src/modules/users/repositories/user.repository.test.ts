import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";

import { UserRepository } from "@/modules/users/repositories/user.repository.js";

describe("UserRepository", () => {
  it("creates the user and credential in one transaction", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            role_id: 2,
            name: "Maria",
            active: true,
            created_at: new Date("2026-09-18T12:00:00.000Z"),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const repository = new UserRepository(
      poolWithClient({ query, release } as unknown as PoolClient),
    );

    const user = await repository.create({
      roleId: 2,
      name: "Maria",
      email: "maria@example.com",
      passwordHash: "scrypt$hash",
      active: true,
    });

    expect(query.mock.calls[0]?.[0]).toBe("BEGIN");
    expect(query.mock.calls[2]?.[1]).toEqual([
      1,
      "maria@example.com",
      "scrypt$hash",
    ]);
    expect(query.mock.calls[3]?.[0]).toBe("COMMIT");
    expect(release).toHaveBeenCalledOnce();
    expect(user).toEqual({
      id: 1,
      role_id: 2,
      name: "Maria",
      email: "maria@example.com",
      active: true,
      created_at: "2026-09-18T12:00:00.000Z",
    });
  });

  it("rolls back and releases the client when credential creation fails", async () => {
    const databaseError = { code: "23505" };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            role_id: 1,
            name: "Maria",
            active: true,
            created_at: new Date(),
          },
        ],
      })
      .mockRejectedValueOnce(databaseError)
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const repository = new UserRepository(
      poolWithClient({ query, release } as unknown as PoolClient),
    );

    await expect(
      repository.create({
        roleId: 1,
        name: "Maria",
        email: "maria@example.com",
        passwordHash: "hash",
        active: true,
      }),
    ).rejects.toBe(databaseError);
    expect(query.mock.calls[3]?.[0]).toBe("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("returns paginated rows and metadata", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: 3,
            role_id: 1,
            name: "Maria",
            email: "maria@example.com",
            active: true,
            created_at: new Date("2026-09-18T12:00:00.000Z"),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: "5" }] });
    const pool = { query } as unknown as Pool;
    const repository = new UserRepository(pool);

    const result = await repository.findAll(2, 2);

    expect(query.mock.calls[0]?.[1]).toEqual([2, 2]);
    expect(result).toEqual({
      data: [
        {
          id: 3,
          role_id: 1,
          name: "Maria",
          email: "maria@example.com",
          active: true,
          created_at: "2026-09-18T12:00:00.000Z",
        },
      ],
      meta: { total_records: 5, total_pages: 3, current_page: 2 },
    });
  });
});

function poolWithClient(client: PoolClient): Pool {
  return { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
}
