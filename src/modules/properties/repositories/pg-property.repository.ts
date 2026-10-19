import type { DatabaseError, Pool } from "pg";

import { UserReferenceNotFoundError } from "@/modules/properties/errors/property.errors.js";
import type { PropertyRepository } from "@/modules/properties/repositories/property.repository.js";
import type {
  CreatePropertyInput,
  Property,
  PropertyRow,
  UpdatePropertyInput,
} from "@/modules/properties/types/property.type.js";

function rethrowForeignKeyViolation(error: unknown): never {
  const pgError = error as Partial<DatabaseError>;

  if (pgError.code === "23503") {
    throw new UserReferenceNotFoundError();
  }

  throw error;
}

export class PgPropertyRepository implements PropertyRepository {
  constructor(private readonly pool: Pool) {}

  async create(data: CreatePropertyInput): Promise<Property> {
    const result = await this.pool
      .query<PropertyRow>(
        `
        INSERT INTO properties (name, owner_user_id, location, created_at)
        VALUES ($1, $2, $3, current_timestamp)
        RETURNING id, name, owner_user_id, location, created_at
      `,
        [data.name, data.owner_user_id, data.location ?? null],
      )
      .catch(rethrowForeignKeyViolation);

    const row = result.rows[0]!;

    return {
      id: row.id,
      name: row.name,
      owner_user_id: row.owner_user_id,
      location: row.location,
      created_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
    };
  }

  async findById(id: number): Promise<Property | null> {
    const result = await this.pool.query<PropertyRow>(
      `
      SELECT id, name, owner_user_id, location, created_at
      FROM properties
      WHERE id = $1
    `,
      [id],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      owner_user_id: row.owner_user_id,
      location: row.location,
      created_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
    };
  }

  async userExists(userId: number): Promise<boolean> {
    const result = await this.pool.query(
      `
      SELECT 1 FROM users WHERE id = $1
    `,
      [userId],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async listProperties(): Promise<
    Array<{ id: number; name: string; location: string | null }>
  > {
    const result = await this.pool.query<{
      id: number;
      name: string;
      location: string | null;
    }>("SELECT id, name, location FROM properties ORDER BY name ASC");

    return result.rows;
  }

  async update(id: number, data: UpdatePropertyInput): Promise<Property | null> {
    const fields: string[] = [];
    const values: unknown[] = [id];
    let index = 2;

    if (data.name !== undefined) {
      fields.push(`name = $${index++}`);
      values.push(data.name);
    }

    if (data.owner_user_id !== undefined) {
      fields.push(`owner_user_id = $${index++}`);
      values.push(data.owner_user_id);
    }

    if (data.location !== undefined) {
      fields.push(`location = $${index++}`);
      values.push(data.location ?? null);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    const result = await this.pool
      .query<PropertyRow>(
        `
        UPDATE properties
        SET ${fields.join(", ")}
        WHERE id = $1
        RETURNING id, name, owner_user_id, location, created_at
      `,
        values,
      )
      .catch(rethrowForeignKeyViolation);

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      owner_user_id: row.owner_user_id,
      location: row.location,
      created_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
    };
  }
}
