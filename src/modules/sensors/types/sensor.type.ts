export interface Sensor {
  id: number;
  station_id: number;
  sensor_type_id: number;
  local_identifier: string;
  operational_status: boolean;
  /** Limites aceitos para as leituras (SCRUM-424). Nulo = sem limite. */
  min_value: number | null;
  max_value: number | null;
  /** Calibração do sensor (SCRUM-600). Nulo = usa a do tipo. */
  gain: number | null;
  offset_value: number | null;
  /** Modelo ou fabricante do sensor instalado. */
  model: string | null;
  created_at: string;
}
