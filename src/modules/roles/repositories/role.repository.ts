import type { Pool } from "pg";

import { database } from "@/config/database.js";
import {
  RoleDeletionConflictError,
  RoleNameConflictError,
} from "@/modules/roles/errors/role.errors.js";
import type { RoleInput } from "@/modules/roles/schemas/role.schema.js";
import type { Role } from "@/modules/roles/types/role.type.js";

export interface RoleRepositoryPort {
  create(input: RoleInput): Promise<Role>;
  findAll(): Promise<Role[]>;
  findById(id: number): Promise<Role | null>;
  update(id: number, input: RoleInput): Promise<Role | null>;
  delete(id: number): Promise<boolean>;
  exists(id: number): Promise<boolean>;
}

type RoleRow = Omit<Role, "created_at"> & {
  created_at: Date | string;
};

function mapRole(row: RoleRow): Role {
  return {
    ...row,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
  };
}

export class RoleRepository implements RoleRepositoryPort {
  constructor(private readonly pool: Pool = database) {}

  async create(input: RoleInput): Promise<Role> {
    try {
      const result = await this.pool.query<RoleRow>(
        `INSERT INTO roles (name, description)
         VALUES ($1, $2)
         RETURNING id, name, description, created_at`,
        [input.name, input.description],
      );
      return mapRole(result.rows[0]!);
    } catch (error) {
      if (hasPostgresCode(error, "23505")) throw new RoleNameConflictError();
      throw error;
    }
  }

  async findById(id: number): Promise<Role | null> {
    const result = await this.pool.query<RoleRow>(
      "SELECT id, name, description, created_at FROM roles WHERE id = $1",
      [id],
    );
    return result.rows[0] ? mapRole(result.rows[0]) : null;
  }

  async update(id: number, input: RoleInput): Promise<Role | null> {
    try {
      const result = await this.pool.query<RoleRow>(
        `UPDATE roles SET name = $2, description = $3 WHERE id = $1
         RETURNING id, name, description, created_at`,
        [id, input.name, input.description],
      );
      return result.rows[0] ? mapRole(result.rows[0]) : null;
    } catch (error) {
      if (hasPostgresCode(error, "23505")) throw new RoleNameConflictError();
      throw error;
    }
  }

  async delete(id: number): Promise<boolean> {
    try {
      const result = await this.pool.query("DELETE FROM roles WHERE id = $1", [
        id,
      ]);
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      // PostgreSQL 18 reports ON DELETE RESTRICT as 23001; older versions use 23503.
      if (hasPostgresCode(error, "23503") || hasPostgresCode(error, "23001")) {
        throw new RoleDeletionConflictError();
      }
      throw error;
    }
  }

  async findAll(): Promise<Role[]> {
    const result = await this.pool.query<RoleRow>(
      `
        SELECT id, name, description, created_at
        FROM roles
        ORDER BY id ASC
      `,
    );

    return result.rows.map(mapRole);
  }

  async exists(id: number): Promise<boolean> {
    const result = await this.pool.query("SELECT 1 FROM roles WHERE id = $1", [
      id,
    ]);

    return (result.rowCount ?? 0) > 0;
  }
}

function hasPostgresCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
