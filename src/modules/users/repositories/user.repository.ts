import type { Pool, PoolClient } from "pg";

import { database } from "@/config/database.js";
import type { PaginatedUsers, User } from "@/modules/users/types/user.type.js";

export type CreateUserRecord = {
  roleId: number;
  name: string;
  email: string;
  passwordHash: string;
  active: boolean;
};

export type UpdateUserRecord = {
  roleId: number;
  name: string;
  active: boolean;
};

export interface UserRepositoryPort {
  create(input: CreateUserRecord): Promise<User>;
  findAll(page: number, limit: number): Promise<PaginatedUsers>;
  findById(id: number): Promise<User | null>;
  update(id: number, input: UpdateUserRecord): Promise<User | null>;
  delete(id: number): Promise<boolean>;
}

type UserRow = Omit<User, "created_at"> & {
  created_at: Date | string;
};

function mapUser(row: UserRow): User {
  return {
    ...row,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
  };
}

export class UserRepository implements UserRepositoryPort {
  constructor(private readonly pool: Pool = database) {}

  async create(input: CreateUserRecord): Promise<User> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      const userResult = await client.query<Omit<UserRow, "email">>(
        `
          INSERT INTO users (role_id, name, active)
          VALUES ($1, $2, $3)
          RETURNING id, role_id, name, active, created_at
        `,
        [input.roleId, input.name, input.active],
      );
      const user = userResult.rows[0]!;

      await client.query(
        `
          INSERT INTO credentials (user_id, email, password_hash)
          VALUES ($1, $2, $3)
        `,
        [user.id, input.email, input.passwordHash],
      );
      await client.query("COMMIT");

      return mapUser({ ...user, email: input.email });
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async findAll(page: number, limit: number): Promise<PaginatedUsers> {
    const offset = (page - 1) * limit;
    const [usersResult, countResult] = await Promise.all([
      this.pool.query<UserRow>(
        `
          SELECT u.id, u.role_id, u.name, c.email, u.active, u.created_at
          FROM users u
          INNER JOIN credentials c ON c.user_id = u.id
          ORDER BY u.id ASC
          LIMIT $1 OFFSET $2
        `,
        [limit, offset],
      ),
      // Mesmo JOIN da listagem: usuário sem credencial não aparece em data,
      // então também não pode entrar no total (senão a paginação mente).
      this.pool.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM users u
          INNER JOIN credentials c ON c.user_id = u.id
        `,
      ),
    ]);
    const totalRecords = Number(countResult.rows[0]?.total ?? 0);

    return {
      data: usersResult.rows.map(mapUser),
      meta: {
        total_records: totalRecords,
        total_pages: Math.ceil(totalRecords / limit),
        current_page: page,
      },
    };
  }

  async findById(id: number): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      `
        SELECT u.id, u.role_id, u.name, c.email, u.active, u.created_at
        FROM users u
        INNER JOIN credentials c ON c.user_id = u.id
        WHERE u.id = $1
      `,
      [id],
    );
    const row = result.rows[0];

    return row ? mapUser(row) : null;
  }

  async update(id: number, input: UpdateUserRecord): Promise<User | null> {
    const result = await this.pool.query<UserRow>(
      `
        WITH updated AS (
          UPDATE users
          SET role_id = $2, name = $3, active = $4
          WHERE id = $1
          RETURNING id, role_id, name, active, created_at
        )
        SELECT u.id, u.role_id, u.name, c.email, u.active, u.created_at
        FROM updated u
        INNER JOIN credentials c ON c.user_id = u.id
      `,
      [id, input.roleId, input.name, input.active],
    );
    const row = result.rows[0];

    return row ? mapUser(row) : null;
  }

  async delete(id: number): Promise<boolean> {
    const result = await this.pool.query("DELETE FROM users WHERE id = $1", [
      id,
    ]);

    return (result.rowCount ?? 0) > 0;
  }

  private async rollback(client: PoolClient): Promise<void> {
    try {
      await client.query("ROLLBACK");
    } catch {
      return;
    }
  }
}
