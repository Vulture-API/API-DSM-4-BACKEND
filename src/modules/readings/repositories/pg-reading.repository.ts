import type { Pool } from "pg";

import type {
  ReadingRepository,
  ReadingsQueryResult,
} from "@/modules/readings/repositories/reading.repository.js";
import type {
  CreateReadingInput,
  ListReadingsFilters,
  Reading,
} from "@/modules/readings/types/reading.type.js";
import { resolveTimeRange } from "@/modules/readings/utils/date-filter.js";

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

  async create(data: CreateReadingInput): Promise<Reading> {
    const result = await this.database.query<Reading>(
      `INSERT INTO readings (sensor_id, value, unix_time, data_consistent)
       VALUES ($1, $2, $3, $4)
       RETURNING id, sensor_id, value::float8 AS value, unix_time, data_consistent, created_at`,
      [
        data.sensor_id,
        data.value,
        data.unix_time,
        data.data_consistent ?? true,
      ],
    );
    return result.rows[0]!;
  }

  async createMany(data: CreateReadingInput[]): Promise<Reading[]> {
    if (data.length === 0) return [];

    const values: unknown[] = [];
    const valueClauses: string[] = [];

    data.forEach((item, index) => {
      const offset = index * 4;
      valueClauses.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`,
      );
      values.push(
        item.sensor_id,
        item.value,
        item.unix_time,
        item.data_consistent ?? true,
      );
    });

    const result = await this.database.query<Reading>(
      `INSERT INTO readings (sensor_id, value, unix_time, data_consistent)
       VALUES ${valueClauses.join(", ")}
       RETURNING id, sensor_id, value::float8 AS value, unix_time, data_consistent, created_at`,
      values,
    );
    return result.rows;
  }

  async stationExists(stationId: number): Promise<boolean> {
    const result = await this.database.query(
      "SELECT 1 FROM stations WHERE id = $1",
      [stationId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findMany(filters: ListReadingsFilters): Promise<ReadingsQueryResult> {
    const { startUnixTime, endUnixTime } = resolveTimeRange(filters);
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

    if (startUnixTime !== undefined) {
      values.push(startUnixTime);
      conditions.push(`r.unix_time >= $${values.length}`);
    }

    if (endUnixTime !== undefined) {
      values.push(endUnixTime);
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
