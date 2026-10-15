export const OCCURRENCE_TYPES = [
  "COMMUNICATION_FAILURE",
  "OUT_OF_RANGE",
] as const;
export const OCCURRENCE_STATUSES = ["OPEN", "RESOLVED"] as const;

export type OccurrenceType = (typeof OCCURRENCE_TYPES)[number];
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

/** Formato devolvido pela API (SCRUM-425). */
export type Occurrence = {
  id: number;
  type: OccurrenceType;
  status: OccurrenceStatus;
  station_id: number;
  station_name: string;
  sensor_id: number | null;
  sensor_identifier: string | null;
  sensor_type: string | null;
  reading_id: number | null;
  value: number | null;
  description: string;
  detected_at: string;
  resolved_at: string | null;
};

export type NewCommunicationFailure = {
  station_id: number;
  description: string;
  detected_at: Date;
};

export type NewOutOfRange = {
  station_id: number;
  sensor_id: number;
  reading_id: number;
  /** Chave de partição de readings: permite pruning no UPDATE. */
  reading_unix_time: number;
  value: number;
  description: string;
  detected_at: Date;
};

/** Última comunicação de cada estação, para a rotina da SCRUM-423. */
export type StationCommunication = {
  station_id: number;
  station_name: string;
  last_communication_at: Date | null;
  created_at: Date;
};

/** Leitura com os limites do sensor, para a validação da SCRUM-424. */
export type ReadingWithLimits = {
  reading_id: number;
  sensor_id: number;
  station_id: number;
  sensor_identifier: string;
  value: number;
  unix_time: number;
  data_consistent: boolean;
  min_value: number | null;
  max_value: number | null;
};

export type OccurrenceFilter = {
  page: number;
  limit: number;
  station_id?: number | undefined;
  sensor_id?: number | undefined;
  type?: OccurrenceType | undefined;
  status?: OccurrenceStatus | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
};

export type CommunicationCheckResult = {
  stations_checked: number;
  failures_opened: number;
  failures_resolved: number;
};

export type LimitCheckResult = {
  readings_checked: number;
  out_of_range: number;
  last_reading_id: number;
};

export type OccurrenceCycleResult = {
  communication: CommunicationCheckResult;
  limits: LimitCheckResult;
};
