export interface Sensor {
  id: number;
  station_id: number;
  sensor_type_id: number;
  local_identifier: string;
  operational_status: boolean;
  created_at: string;
}
