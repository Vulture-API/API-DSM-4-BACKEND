export type Reading = {
  id: number;
  sensor_id: number;
  value: number;
  unix_time: number;
  data_consistent: boolean;
  created_at: Date;
};

export type CreateReadingInput = {
  sensor_id: number;
  value: number;
  unix_time: number;
  data_consistent?: boolean | undefined;
};

export type StationReadingItem = {
  sensor_id?: number | undefined;
  local_identifier?: string | undefined;
  value: number;
  unix_time?: number | undefined;
  data_consistent?: boolean | undefined;
};

export type IngestStationDataInput = {
  station_id?: number | undefined;
  mac_address?: string | undefined;
  unix_time?: number | undefined;
  readings: StationReadingItem[];
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
