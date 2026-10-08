export interface SensorType {
  id: number;
  name: string;
  unit_of_measure: string;
  factor?: number | null | undefined;
  gain?: number | null | undefined;
}
