import type { Pool } from "pg";

import type { AuthUser, Credential } from "@/modules/auth/types.js";

export interface AuthRepositoryPort {
  findCredentialByEmail(email: string): Promise<Credential | null>;
  findUserById(id: number): Promise<AuthUser | null>;
}

type CredentialRow = Omit<Credential, "created_at"> & {
  created_at: Date | string;
};
const columns = `u.id, u.role_id, u.name, u.active, u.created_at, c.email,
  COALESCE((SELECT array_agg(rp.permission_code ORDER BY rp.permission_code)
            FROM role_permissions rp WHERE rp.role_id = u.role_id), '{}') AS permissions`;

export class PgAuthRepository implements AuthRepositoryPort {
  constructor(private readonly pool: Pool) {}

  async findCredentialByEmail(email: string): Promise<Credential | null> {
    const result = await this.pool.query<CredentialRow>(
      `SELECT ${columns}, c.password_hash FROM users u
       INNER JOIN credentials c ON c.user_id = u.id WHERE c.email = $1`,
      [email],
    );
    const row = result.rows[0];
    return row
      ? { ...row, created_at: new Date(row.created_at).toISOString() }
      : null;
  }

  async findUserById(id: number): Promise<AuthUser | null> {
    const result = await this.pool.query<Omit<CredentialRow, "password_hash">>(
      `SELECT ${columns} FROM users u
       INNER JOIN credentials c ON c.user_id = u.id WHERE u.id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row
      ? { ...row, created_at: new Date(row.created_at).toISOString() }
      : null;
  }
}
