import type { Pool } from "pg";

import type {
  CommunicationMonitorRepository,
  OccurrenceRepository,
  SensorLimitRepository,
} from "@/modules/occurrences/repositories/occurrence.repository.js";
import type {
  NewCommunicationFailure,
  NewOutOfRange,
  Occurrence,
  OccurrenceFilter,
  ReadingWithLimits,
  StationCommunication,
} from "@/modules/occurrences/types/occurrence.type.js";
import {
  buildPaginationMeta,
  type Paginated,
} from "@/shared/types/paginated.type.js";

const CHECKPOINT_KEY = "occurrences_last_reading_id";

// As colunas são `timestamp` sem fuso guardando UTC. Gravar a partir do ISO
// com fuso evita depender do TimeZone da sessão.
const UTC = (param: string) => `(${param}::timestamptz AT TIME ZONE 'UTC')`;

/** Aceita Date (parser do pool da aplicação) ou texto cru do driver. */
function toDate(value: Date | string): Date {
  return value instanceof Date
    ? value
    : new Date(`${value.replace(" ", "T")}Z`);
}

type OccurrenceRow = Omit<Occurrence, "detected_at" | "resolved_at"> & {
  detected_at: Date | string;
  resolved_at: Date | string | null;
};

function mapOccurrence(row: OccurrenceRow): Occurrence {
  return {
    ...row,
    detected_at: toDate(row.detected_at).toISOString(),
    resolved_at: row.resolved_at ? toDate(row.resolved_at).toISOString() : null,
  };
}

const SELECT_OCCURRENCE = `
  SELECT
    o.id, o.type, o.status, o.station_id, st.name AS station_name,
    o.sensor_id, se.local_identifier AS sensor_identifier,
    sty.name AS sensor_type, o.reading_id, o.value::float8 AS value,
    o.description, o.detected_at, o.resolved_at
  FROM occurrences o
  JOIN stations st ON st.id = o.station_id
  LEFT JOIN sensors se ON se.id = o.sensor_id
  LEFT JOIN sensor_types sty ON sty.id = se.sensor_type_id`;

const FILTER = `
  WHERE ($1::int IS NULL OR o.station_id = $1)
    AND ($2::int IS NULL OR o.sensor_id = $2)
    AND ($3::text IS NULL OR o.type = $3)
    AND ($4::text IS NULL OR o.status = $4)
    AND ($5::timestamptz IS NULL OR o.detected_at >= ${UTC("$5")})
    AND ($6::timestamptz IS NULL OR o.detected_at <= ${UTC("$6")})`;

export class PgOccurrenceRepository
  implements
    OccurrenceRepository,
    CommunicationMonitorRepository,
    SensorLimitRepository
{
  constructor(private readonly database: Pool) {}

  async list(filter: OccurrenceFilter): Promise<Paginated<Occurrence>> {
    const params = [
      filter.station_id ?? null,
      filter.sensor_id ?? null,
      filter.type ?? null,
      filter.status ?? null,
      filter.from?.toISOString() ?? null,
      filter.to?.toISOString() ?? null,
    ];
    const [rows, count] = await Promise.all([
      this.database.query<OccurrenceRow>(
        `${SELECT_OCCURRENCE} ${FILTER}
         ORDER BY o.detected_at DESC, o.id DESC
         LIMIT $7 OFFSET $8`,
        [...params, filter.limit, (filter.page - 1) * filter.limit],
      ),
      this.database.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM occurrences o ${FILTER}`,
        params,
      ),
    ]);
    return {
      data: rows.rows.map(mapOccurrence),
      meta: buildPaginationMeta(
        count.rows[0]?.total ?? 0,
        filter.page,
        filter.limit,
      ),
    };
  }

  async findById(id: number): Promise<Occurrence | null> {
    const result = await this.database.query<OccurrenceRow>(
      `${SELECT_OCCURRENCE} WHERE o.id = $1`,
      [id],
    );
    return result.rows[0] ? mapOccurrence(result.rows[0]) : null;
  }

  async resolve(id: number, at: Date): Promise<Occurrence | null> {
    const updated = await this.database.query(
      `UPDATE occurrences SET status = 'RESOLVED', resolved_at = ${UTC("$2")}
       WHERE id = $1 AND status = 'OPEN'`,
      [id, at.toISOString()],
    );
    return (updated.rowCount ?? 0) > 0 ? this.findById(id) : null;
  }

  async listStationCommunications(): Promise<StationCommunication[]> {
    const result = await this.database.query<{
      station_id: number;
      station_name: string;
      last_communication_at: Date | string | null;
      created_at: Date | string;
    }>(
      `SELECT id AS station_id, name AS station_name, last_communication_at, created_at
       FROM stations ORDER BY id`,
    );
    return result.rows.map((row) => ({
      station_id: row.station_id,
      station_name: row.station_name,
      last_communication_at: row.last_communication_at
        ? toDate(row.last_communication_at)
        : null,
      created_at: toDate(row.created_at),
    }));
  }

  async listOpenCommunicationFailures(): Promise<
    { id: number; station_id: number }[]
  > {
    const result = await this.database.query<{
      id: number;
      station_id: number;
    }>(
      `SELECT id::int AS id, station_id FROM occurrences
       WHERE type = 'COMMUNICATION_FAILURE' AND status = 'OPEN'`,
    );
    return result.rows;
  }

  async openCommunicationFailure(
    data: NewCommunicationFailure,
  ): Promise<boolean> {
    const result = await this.database.query(
      `INSERT INTO occurrences (type, station_id, description, detected_at)
       VALUES ('COMMUNICATION_FAILURE', $1, $2, ${UTC("$3")})
       ON CONFLICT (station_id)
         WHERE type = 'COMMUNICATION_FAILURE' AND status = 'OPEN'
       DO NOTHING`,
      [data.station_id, data.description, data.detected_at.toISOString()],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async resolveOccurrences(ids: number[], at: Date): Promise<number> {
    const result = await this.database.query(
      `UPDATE occurrences SET status = 'RESOLVED', resolved_at = ${UTC("$2")}
       WHERE id = ANY($1::bigint[]) AND status = 'OPEN'`,
      [ids, at.toISOString()],
    );
    return result.rowCount ?? 0;
  }

  async getCheckpoint(): Promise<number> {
    const result = await this.database.query<{ value: string }>(
      "SELECT value FROM processing_checkpoints WHERE key = $1",
      [CHECKPOINT_KEY],
    );
    return Number(result.rows[0]?.value ?? 0);
  }

  async setCheckpoint(readingId: number): Promise<void> {
    await this.database.query(
      `INSERT INTO processing_checkpoints (key, value, updated_at)
       VALUES ($1, $2, current_timestamp)
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = current_timestamp`,
      [CHECKPOINT_KEY, String(readingId)],
    );
  }

  async findReadingsAfter(
    afterId: number,
    limit: number,
  ): Promise<ReadingWithLimits[]> {
    const result = await this.database.query<ReadingWithLimits>(
      `SELECT
         r.id::bigint AS reading_id, r.sensor_id, s.station_id,
         s.local_identifier AS sensor_identifier, r.value::float8 AS value,
         r.unix_time::bigint AS unix_time, r.data_consistent,
         s.min_value::float8 AS min_value, s.max_value::float8 AS max_value
       FROM readings r
       JOIN sensors s ON s.id = r.sensor_id
       WHERE r.id > $1
       ORDER BY r.id ASC
       LIMIT $2`,
      [afterId, limit],
    );
    return result.rows.map((row) => ({
      ...row,
      reading_id: Number(row.reading_id),
      unix_time: Number(row.unix_time),
    }));
  }

  async flagOutOfRange(data: NewOutOfRange): Promise<boolean> {
    const client = await this.database.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE readings SET data_consistent = false
         WHERE id = $1 AND unix_time = $2 AND data_consistent`,
        [data.reading_id, data.reading_unix_time],
      );
      const inserted = await client.query(
        `INSERT INTO occurrences
           (type, station_id, sensor_id, reading_id, value, description, detected_at)
         VALUES ('OUT_OF_RANGE', $1, $2, $3, $4, $5, ${UTC("$6")})
         ON CONFLICT (sensor_id)
           WHERE type = 'OUT_OF_RANGE' AND status = 'OPEN'
         DO NOTHING`,
        [
          data.station_id,
          data.sensor_id,
          data.reading_id,
          data.value,
          data.description,
          data.detected_at.toISOString(),
        ],
      );
      await client.query("COMMIT");
      return (inserted.rowCount ?? 0) > 0;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
