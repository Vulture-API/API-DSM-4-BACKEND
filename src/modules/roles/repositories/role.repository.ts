import type { Pool } from "pg";

import { database } from "@/config/database.js";
import type { Role } from "@/modules/roles/types/role.type.js";

export interface RoleRepositoryPort {
  findAll(): Promise<Role[]>;
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
