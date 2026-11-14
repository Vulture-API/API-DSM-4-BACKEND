import type { Pool, PoolClient } from "pg";

import { PropertyNotFoundError } from "@/modules/properties/errors/property.errors.js";
import { UserNotFoundError } from "@/modules/users/errors/user.errors.js";

export type UserProperty = {
  id: number;
  name: string;
  location: string | null;
  owner_user_id: number;
};

export class UserPropertiesRepository {
  constructor(private readonly pool: Pool) {}

  private async properties(
    connection: Pick<PoolClient, "query">,
    userId: number,
  ): Promise<UserProperty[]> {
    const result = await connection.query<UserProperty>(
      `SELECT p.id, p.name, p.location, p.owner_user_id FROM properties p
       JOIN user_properties up ON up.property_id=p.id WHERE up.user_id=$1 ORDER BY p.name, p.id`,
      [userId],
    );
    return result.rows;
  }

  async list(userId: number): Promise<UserProperty[]> {
    if (
      !(await this.pool.query("SELECT id FROM users WHERE id=$1", [userId]))
        .rowCount
    )
      throw new UserNotFoundError();
    return this.properties(this.pool, userId);
  }

  async replace(
    userId: number,
    propertyIds: number[],
  ): Promise<UserProperty[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (
        !(
          await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
            userId,
          ])
        ).rowCount
      )
        throw new UserNotFoundError();
      const ids = [...new Set(propertyIds)].sort((a, b) => a - b);
      const existing = await client.query(
        "SELECT id FROM properties WHERE id=ANY($1::int[]) ORDER BY id FOR KEY SHARE",
        [ids],
      );
      if (existing.rowCount !== ids.length) throw new PropertyNotFoundError();
      await client.query("DELETE FROM user_properties WHERE user_id=$1", [
        userId,
      ]);
      await client.query(
        "INSERT INTO user_properties(user_id,property_id) SELECT $1, unnest($2::int[])",
        [userId, ids],
      );
      const properties = await this.properties(client, userId);
      await client.query("COMMIT");
      return properties;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
