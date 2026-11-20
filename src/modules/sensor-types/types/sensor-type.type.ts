export interface SensorType {
  id: number;
  name: string;
  unit_of_measure: string;
  factor?: number | null | undefined;
  gain?: number | null | undefined;
  offset_value?: number | null | undefined;
  // Limites físicos do tipo (SCRUM-634): valem para os sensores dele que não
  // têm limite próprio.
  min_value?: number | null | undefined;
  max_value?: number | null | undefined;
}
