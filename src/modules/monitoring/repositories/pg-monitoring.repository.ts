import type { Pool } from "pg";

import type { MonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import type {
  SensorTypeSeries,
  SeriesFilters,
  StationSnapshot,
} from "@/modules/monitoring/types/monitoring.type.js";

// Uma consulta para o dashboard inteiro. A última leitura de cada sensor sai
// por LATERAL ... ORDER BY unix_time DESC LIMIT 1, que usa o índice
// idx_readings_sensor_time (sensor_id, unix_time DESC) — não varre readings.
const SNAPSHOTS_SQL = `
  SELECT
    st.id,
    st.name,
    st.mac_address,
    st.property_id,
    p.name AS property_name,
    st.latitude::float8 AS latitude,
    st.longitude::float8 AS longitude,
    st.last_communication_at,
    COALESCE(sen.total, 0)::int AS sensors_total,
    COALESCE(sen.active, 0)::int AS sensors_active,
    COALESCE(al.pending, 0)::int AS active_alerts,
    COALESCE(lr.readings, '[]'::json) AS latest_readings
  FROM stations st
  JOIN properties p ON p.id = st.property_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS total,
           count(*) FILTER (WHERE s.operational_status) AS active
    FROM sensors s
    WHERE s.station_id = st.id
  ) sen ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS pending
    FROM triggered_alerts ta
    JOIN alert_configs ac ON ac.id = ta.alert_config_id
    JOIN sensors s ON s.id = ac.sensor_id
    WHERE s.station_id = st.id AND ta.acknowledged_at IS NULL
  ) al ON true
  LEFT JOIN LATERAL (
    SELECT json_agg(
             json_build_object(
               'sensor_id', s.id,
               'local_identifier', s.local_identifier,
               'sensor_type_id', t.id,
               'sensor_type', t.name,
               'unit_of_measure', t.unit_of_measure,
               'value', r.value::float8,
               'unix_time', r.unix_time
             ) ORDER BY t.name, s.local_identifier
           ) AS readings
    FROM sensors s
    JOIN sensor_types t ON t.id = s.sensor_type_id
    JOIN LATERAL (
      SELECT value, unix_time
      FROM readings r
      WHERE r.sensor_id = s.id
      ORDER BY r.unix_time DESC
      LIMIT 1
    ) r ON true
    WHERE s.station_id = st.id
  ) lr ON true
  WHERE ($1::int IS NULL OR st.property_id = $1::int)
  ORDER BY st.name ASC, st.id ASC
`;

// Agrega por intervalo fixo em segundos: (unix_time / N) * N é o início do
// intervalo. Só leituras consistentes entram na média.
const SERIES_SQL = `
  SELECT
    t.id AS sensor_type_id,
    t.name AS sensor_type,
    t.unit_of_measure,
    json_agg(
      json_build_object('t', b.bucket, 'avg', b.avg, 'min', b.min, 'max', b.max)
      ORDER BY b.bucket
    ) AS points
  FROM (
    SELECT
      s.sensor_type_id,
      (r.unix_time / $2::bigint) * $2::bigint AS bucket,
      round(avg(r.value), 2)::float8 AS avg,
      min(r.value)::float8 AS min,
      max(r.value)::float8 AS max
    FROM readings r
    JOIN sensors s ON s.id = r.sensor_id
    JOIN stations st ON st.id = s.station_id
    WHERE r.unix_time >= $1::bigint
      AND r.data_consistent
      AND ($3::int IS NULL OR s.station_id = $3::int)
      AND ($4::int IS NULL OR st.property_id = $4::int)
    GROUP BY 1, 2
  ) b
  JOIN sensor_types t ON t.id = b.sensor_type_id
  GROUP BY t.id, t.name, t.unit_of_measure
  ORDER BY t.name ASC
`;

export class PgMonitoringRepository implements MonitoringRepository {
  constructor(private readonly database: Pool) {}

  async listSnapshots(propertyId?: number): Promise<StationSnapshot[]> {
    const result = await this.database.query<StationSnapshot>(SNAPSHOTS_SQL, [
      propertyId ?? null,
    ]);
    return result.rows;
  }

  async readingSeries(filters: SeriesFilters): Promise<SensorTypeSeries[]> {
    const result = await this.database.query<SensorTypeSeries>(SERIES_SQL, [
      filters.from_unix,
      filters.bucket_seconds,
      filters.station_id ?? null,
      filters.property_id ?? null,
    ]);
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
