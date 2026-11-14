import type { Pool } from "pg";

import {
  ForecastProviderError,
  ForecastUnavailableError,
} from "@/modules/forecast/errors/forecast.errors.js";
import { FORECAST_MAX_DAYS } from "@/modules/forecast/providers/cached-forecast.provider.js";
import type { ForecastProvider } from "@/modules/forecast/providers/forecast.provider.js";
import type {
  ReportAlertFilters,
  ReportAlertRow,
  ReportForecastQuery,
  ReportForecastRow,
  ReportPropertyInfo,
  ReportQueryFilters,
  ReportReadingRow,
  ReportRepository,
  ReportStationInfo,
} from "@/modules/reports/repositories/report.repository.js";

export type ReportForecastErrorContext = ReportForecastQuery;

type PgStationRow = {
  id: number | string;
  name: string;
  latitude: number | string | null;
  longitude: number | string | null;
  property_id: number | string;
  property_name: string;
};

type PgPropertyRow = {
  id: number | string;
  name: string;
};

type PgReadingRow = {
  id: number | string;
  station_id: number | string;
  sensor_id: number | string;
  sensor_type_id: number | string;
  sensor_type: string;
  unit_of_measure: string;
  value: number | string;
  unix_time: number | string;
  data_consistent: boolean;
};

type PgAlertRow = {
  id: number | string;
  station_id: number | string;
  station_name: string;
  sensor_id: number | string;
  sensor_type: string;
  unit_of_measure: string;
  rule_name: string;
  condition: string;
  threshold_value: number | string;
  reading_value: number | string;
  triggered_at: Date | string;
  status: "pending" | "acknowledged";
};

function toIsoUtc(value: Date | string): string {
  const date =
    value instanceof Date ? value : new Date(`${value.replace(" ", "T")}Z`);
  return date.toISOString();
}

const STATION_INFO_SQL = `
  SELECT
    st.id,
    st.name,
    st.latitude::float8 AS latitude,
    st.longitude::float8 AS longitude,
    st.property_id,
    p.name AS property_name
  FROM stations st
  JOIN properties p ON p.id = st.property_id
  WHERE st.id = $1
`;

const PROPERTY_INFO_SQL = `
  SELECT id, name
  FROM properties
  WHERE id = $1
`;

const READINGS_SQL = `
  SELECT
    r.id,
    s.station_id,
    r.sensor_id,
    s.sensor_type_id,
    t.name AS sensor_type,
    t.unit_of_measure,
    r.value::float8 AS value,
    r.unix_time,
    r.data_consistent
  FROM readings r
  JOIN sensors s ON s.id = r.sensor_id
  JOIN stations st ON st.id = s.station_id
  JOIN sensor_types t ON t.id = s.sensor_type_id
  WHERE r.unix_time >= $1::bigint
    AND r.unix_time <= $2::bigint
    AND ($3::int IS NULL OR s.station_id = $3::int)
    AND ($4::int IS NULL OR st.property_id = $4::int)
  ORDER BY r.unix_time ASC, r.id ASC
`;

// triggered_at e stored sem fuso em UTC; converter ::timestamptz garante comparacao independente da sessao.
const ALERTS_SQL = `
  SELECT
    ta.id,
    st.id AS station_id,
    st.name AS station_name,
    s.id AS sensor_id,
    t.name AS sensor_type,
    t.unit_of_measure,
    COALESCE(NULLIF(btrim(ac.message), ''), 'Alerta #' || ac.id::text) AS rule_name,
    ac.comparison_operator || ' ' || (ac.reference_value::float8)::text AS condition,
    ac.reference_value::float8 AS threshold_value,
    r.value::float8 AS reading_value,
    ta.triggered_at,
    CASE
      WHEN ta.acknowledged_at IS NULL THEN 'pending'
      ELSE 'acknowledged'
    END AS status
  FROM triggered_alerts ta
  JOIN alert_configs ac ON ac.id = ta.alert_config_id
  JOIN readings r ON r.id = ta.reading_id
  JOIN sensors s ON s.id = ac.sensor_id
  JOIN stations st ON st.id = s.station_id
  JOIN sensor_types t ON t.id = s.sensor_type_id
  WHERE ta.triggered_at >= ($1::timestamptz AT TIME ZONE 'UTC')
    AND ta.triggered_at <= ($2::timestamptz AT TIME ZONE 'UTC')
    AND ($3::int IS NULL OR st.id = $3::int)
    AND ($4::int IS NULL OR st.property_id = $4::int)
  ORDER BY ta.triggered_at DESC, ta.id DESC
`;

/**
 * Repositorio PostgreSQL para consulta e geracao de relatorios meteorologicos.
 */
export class PgReportRepository implements ReportRepository {
  constructor(
    private readonly database: Pool,
    private readonly forecastProvider: ForecastProvider,
    private readonly extendedForecastProvider?: ForecastProvider,
    private readonly onForecastError?: (
      error: unknown,
      context: ReportForecastErrorContext,
    ) => void,
  ) {}

  async getStationInfo(stationId: number): Promise<ReportStationInfo | null> {
    const result = await this.database.query<PgStationRow>(STATION_INFO_SQL, [
      stationId,
    ]);
    const row = result.rows[0];
    if (!row) return null;

    return {
      id: Number(row.id),
      name: row.name,
      latitude: row.latitude === null ? null : Number(row.latitude),
      longitude: row.longitude === null ? null : Number(row.longitude),
      property_id: Number(row.property_id),
      property_name: row.property_name,
    };
  }

  async getPropertyInfo(
    propertyId: number,
  ): Promise<ReportPropertyInfo | null> {
    const result = await this.database.query<PgPropertyRow>(PROPERTY_INFO_SQL, [
      propertyId,
    ]);
    const row = result.rows[0];
    if (!row) return null;

    return {
      id: Number(row.id),
      name: row.name,
    };
  }

  async getReadings(filters: ReportQueryFilters): Promise<ReportReadingRow[]> {
    const result = await this.database.query<PgReadingRow>(READINGS_SQL, [
      filters.from_unix,
      filters.to_unix,
      filters.station_id ?? null,
      filters.property_id ?? null,
    ]);

    return result.rows.map((row) => ({
      id: Number(row.id),
      station_id: Number(row.station_id),
      sensor_id: Number(row.sensor_id),
      sensor_type_id: Number(row.sensor_type_id),
      sensor_type: row.sensor_type,
      unit_of_measure: row.unit_of_measure,
      value: Number(row.value),
      unix_time: Number(row.unix_time),
      data_consistent: row.data_consistent,
    }));
  }

  async getAlerts(filters: ReportAlertFilters): Promise<ReportAlertRow[]> {
    const result = await this.database.query<PgAlertRow>(ALERTS_SQL, [
      filters.from_date.toISOString(),
      filters.to_date.toISOString(),
      filters.station_id ?? null,
      filters.property_id ?? null,
    ]);

    return result.rows.map((row) => ({
      id: Number(row.id),
      station_id: Number(row.station_id),
      station_name: row.station_name,
      sensor_id: Number(row.sensor_id),
      sensor_type: row.sensor_type,
      unit_of_measure: row.unit_of_measure,
      rule_name: row.rule_name,
      condition: row.condition,
      threshold_value: Number(row.threshold_value),
      reading_value: Number(row.reading_value),
      triggered_at: toIsoUtc(row.triggered_at),
      status: row.status,
    }));
  }

  async getForecast(
    query: ReportForecastQuery,
  ): Promise<{ source: string; days: ReportForecastRow[] }> {
    const provider =
      query.days > FORECAST_MAX_DAYS && this.extendedForecastProvider
        ? this.extendedForecastProvider
        : this.forecastProvider;

    try {
      const days = await provider.daily({
        latitude: query.latitude,
        longitude: query.longitude,
        days: query.days,
      });
      return { source: provider.source, days };
    } catch (error) {
      if (!(error instanceof ForecastProviderError)) throw error;
      this.onForecastError?.(error, query);
      throw new ForecastUnavailableError({ cause: error });
    }
  }
}
