import type { Pool } from "pg";

import { ApplicationError } from "@/errors/application.error.js";
import { RoleNotFoundError } from "@/modules/roles/errors/role.errors.js";

export type Permission = { code: string; description: string };
export interface PermissionRepositoryPort {
  list(): Promise<Permission[]>;
  findByRoleId(id: number): Promise<string[] | null>;
  findByRoleIds(ids: number[]): Promise<Map<number, string[]>>;
  replace(id: number, permissions: string[]): Promise<string[]>;
}

export class PgPermissionRepository implements PermissionRepositoryPort {
  constructor(private readonly pool: Pool) {}
  async list(): Promise<Permission[]> {
    return (
      await this.pool.query<Permission>(
        "SELECT code, description FROM permissions ORDER BY code",
      )
    ).rows;
  }
  async findByRoleId(id: number): Promise<string[] | null> {
    const result = await this.pool.query<{ permissions: string[] }>(
      `SELECT COALESCE(array_agg(rp.permission_code ORDER BY rp.permission_code)
       FILTER (WHERE rp.permission_code IS NOT NULL), '{}') AS permissions
       FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id
       WHERE r.id = $1 GROUP BY r.id`,
      [id],
    );
    return result.rows[0]?.permissions ?? null;
  }
  async findByRoleIds(ids: number[]): Promise<Map<number, string[]>> {
    if (ids.length === 0) return new Map();
    const result = await this.pool.query<{
      role_id: number;
      permissions: string[];
    }>(
      `SELECT role_id, array_agg(permission_code ORDER BY permission_code) AS permissions
       FROM role_permissions WHERE role_id = ANY($1::int[]) GROUP BY role_id`,
      [ids],
    );
    return new Map(result.rows.map((row) => [row.role_id, row.permissions]));
  }
  async replace(id: number, permissions: string[]): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const role = await client.query(
        "SELECT id FROM roles WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (!role.rowCount) throw new RoleNotFoundError();
      const known = await client.query(
        "SELECT code FROM permissions WHERE code = ANY($1::text[])",
        [permissions],
      );
      if (
        new Set(permissions).size !== permissions.length ||
        known.rowCount !== permissions.length
      ) {
        throw new ApplicationError(400, "Invalid permissions.");
      }
      await client.query("DELETE FROM role_permissions WHERE role_id = $1", [
        id,
      ]);
      await client.query(
        "INSERT INTO role_permissions (role_id, permission_code) SELECT $1, unnest($2::text[])",
        [id, permissions],
      );
      await client.query("COMMIT");
      return [...permissions].sort();
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
