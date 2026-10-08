export type LatestReading = {
  sensor_id: number;
  local_identifier: string;
  sensor_type_id: number;
  sensor_type: string;
  unit_of_measure: string;
  value: number;
  unix_time: number;
};

/** Linha crua do repositório: o status é calculado no serviço. */
export type StationSnapshot = {
  id: number;
  name: string;
  mac_address: string;
  property_id: number;
  property_name: string;
  latitude: number | null;
  longitude: number | null;
  last_communication_at: Date | null;
  sensors_total: number;
  sensors_active: number;
  active_alerts: number;
  latest_readings: LatestReading[];
};

export type OverviewStatus = "Online" | "Com alerta" | "Offline";

export type StationOverview = StationSnapshot & { status: OverviewStatus };

export type Overview = {
  generated_at: Date;
  offline_threshold_minutes: number;
  summary: {
    total: number;
    online: number;
    with_alert: number;
    offline: number;
  };
  stations: StationOverview[];
};

export type SeriesFilters = {
  station_id?: number | undefined;
  property_id?: number | undefined;
  from_unix: number;
  bucket_seconds: number;
};

export type SeriesPoint = {
  /** Início do intervalo, em segundos Unix. */
  t: number;
  avg: number;
  min: number;
  max: number;
};

export type SensorTypeSeries = {
  sensor_type_id: number;
  sensor_type: string;
  unit_of_measure: string;
  points: SeriesPoint[];
};

export type ReadingSeries = {
  from: Date;
  to: Date;
  bucket_minutes: number;
  series: SensorTypeSeries[];
};
