export interface Sensor {
  id: number;
  station_id: number;
  sensor_type_id: number;
  local_identifier: string;
  operational_status: boolean;
  /** Limites aceitos para as leituras (SCRUM-424). Nulo = sem limite. */
  min_value: number | null;
  max_value: number | null;
  created_at: string;
}
