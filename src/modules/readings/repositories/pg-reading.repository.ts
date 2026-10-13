import type { Pool } from "pg";

import type {
  ReadingRepository,
  ReadingsQueryResult,
} from "@/modules/readings/repositories/reading.repository.js";
import type {
  ListReadingsFilters,
  Reading,
} from "@/modules/readings/types/reading.type.js";

const READING_COLUMNS = `
  r.id,
  r.sensor_id,
  r.value::float8 AS value,
  r.unix_time,
  r.data_consistent,
  r.created_at
`;

type WithTotal<T> = T & { total_records: string };

function stripTotal<T extends object>(rows: WithTotal<T>[]): T[] {
  return rows
    .filter((row) => (row as { id?: unknown }).id != null)
    .map(({ total_records: _ignored, ...row }) => row as unknown as T);
}

export class PgReadingRepository implements ReadingRepository {
  constructor(private readonly database: Pool) {}

  async findMany(filters: ListReadingsFilters): Promise<ReadingsQueryResult> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters.sensor_id !== undefined) {
      values.push(filters.sensor_id);
      conditions.push(`r.sensor_id = $${values.length}`);
    }

    if (filters.station_id !== undefined) {
      values.push(filters.station_id);
      conditions.push(
        `r.sensor_id IN (SELECT s.id FROM sensors s WHERE s.station_id = $${values.length})`,
      );
    }

    if (filters.start_unix_time !== undefined) {
      values.push(filters.start_unix_time);
      conditions.push(`r.unix_time >= $${values.length}`);
    }

    if (filters.end_unix_time !== undefined) {
      values.push(filters.end_unix_time);
      conditions.push(`r.unix_time <= $${values.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const limitParamIndex = values.length + 1;
    values.push(filters.limit);

    const offsetParamIndex = values.length + 1;
    const offset = (filters.page - 1) * filters.limit;
    values.push(offset);

    const query = `
      WITH filtered AS (
        SELECT ${READING_COLUMNS}
        FROM readings r
        ${whereClause}
      )
      SELECT page.*, total.total_records
      FROM (SELECT COUNT(*) AS total_records FROM filtered) AS total
      LEFT JOIN LATERAL (
        SELECT * FROM filtered
        ORDER BY unix_time DESC, id DESC
        LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
      ) AS page ON true
    `;

    const result = await this.database.query<WithTotal<Reading>>(query, values);

    return {
      data: stripTotal(result.rows),
      total_records: Number(result.rows[0]?.total_records ?? 0),
    };
  }
}
