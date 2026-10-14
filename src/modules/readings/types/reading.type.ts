export type Reading = {
  id: number;
  sensor_id: number;
  value: number;
  unix_time: number;
  data_consistent: boolean;
  created_at: Date;
};

export type ListReadingsFilters = {
  page: number;
  limit: number;
  sensor_id?: number | undefined;
  station_id?: number | undefined;
  start_unix_time?: number | undefined;
  end_unix_time?: number | undefined;
  start_date?: string | undefined;
  end_date?: string | undefined;
  initial_date?: string | undefined;
  final_date?: string | undefined;
};
