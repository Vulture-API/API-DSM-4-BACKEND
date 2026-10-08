import type { Pool } from "pg";

import type { StatisticsRepository } from "@/modules/statistics/repositories/statistics.repository.js";
import type {
  SensorTypeStatistics,
  StatisticsFilters,
} from "@/modules/statistics/types/statistics.type.js";

// Agrega por tipo de sensor só as leituras consistentes do período
// [from, to). stddev_samp devolve NULL com menos de duas leituras.
const SUMMARY_SQL = `
  SELECT
    t.id AS sensor_type_id,
    t.name AS sensor_type,
    t.unit_of_measure,
    count(*)::int AS count,
    round(avg(r.value), 2)::float8 AS avg,
    min(r.value)::float8 AS min,
    max(r.value)::float8 AS max,
    round(stddev_samp(r.value), 2)::float8 AS stddev,
    to_timestamp(min(r.unix_time)) AS first_reading_at,
    to_timestamp(max(r.unix_time)) AS last_reading_at
  FROM readings r
  JOIN sensors s ON s.id = r.sensor_id
  JOIN stations st ON st.id = s.station_id
  JOIN sensor_types t ON t.id = s.sensor_type_id
  WHERE r.unix_time >= $1::bigint
    AND r.unix_time < $2::bigint
    AND r.data_consistent
    AND ($3::int IS NULL OR s.station_id = $3::int)
    AND ($4::int IS NULL OR st.property_id = $4::int)
  GROUP BY t.id, t.name, t.unit_of_measure
  ORDER BY t.name ASC
`;

export class PgStatisticsRepository implements StatisticsRepository {
  constructor(private readonly database: Pool) {}

  async summarize(filters: StatisticsFilters): Promise<SensorTypeStatistics[]> {
    const result = await this.database.query<SensorTypeStatistics>(
      SUMMARY_SQL,
      [
        filters.from_unix,
        filters.to_unix,
        filters.station_id ?? null,
        filters.property_id ?? null,
      ],
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
}
