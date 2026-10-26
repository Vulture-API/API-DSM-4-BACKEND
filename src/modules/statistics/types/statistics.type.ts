export type StatisticsFilters = {
  station_id?: number | undefined;
  property_id?: number | undefined;
  from_unix: number;
  to_unix: number;
};

export type SensorTypeStatistics = {
  sensor_type_id: number;
  sensor_type: string;
  unit_of_measure: string;
  count: number;
  avg: number;
  min: number;
  max: number;
  /** null com menos de duas leituras no período. */
  stddev: number | null;
  first_reading_at: Date;
  last_reading_at: Date;
};

export type Statistics = {
  from: Date;
  to: Date;
  station_id: number | null;
  property_id: number | null;
  readings_total: number;
  sensor_types: SensorTypeStatistics[];
};
