export type CanonicalReportType = "history" | "forecast" | "alerts";

export type ReportType =
  | CanonicalReportType
  | "historico"
  | "histórico"
  | "leituras"
  | "dados"
  | "previsao"
  | "previsão"
  | "previsoes"
  | "previsões"
  | "tempo"
  | "alertas"
  | "ocorrencias"
  | "ocorrências";

export type GenerateReportInput = {
  type: string;
  station_id?: number | undefined;
  property_id?: number | undefined;
  from?: Date | string | undefined;
  to?: Date | string | undefined;
  days?: number | undefined;
};

export type HistorySensorSummary = {
  sensor_type_id: number;
  sensor_type: string;
  unit_of_measure: string;
  count: number;
  avg: number;
  min: number;
  max: number;
  stddev: number | null;
  accumulated: number | null;
};

export type HistoryReadingItem = {
  id: number;
  sensor_id: number;
  sensor_type_id: number;
  sensor_type: string;
  unit_of_measure: string;
  value: number;
  unix_time: number;
  date_time: string;
  data_consistent: boolean;
};

export type HistoryReport = {
  report_type: "history";
  generated_at: string;
  period: { from: string; to: string };
  station: { id: number; name: string } | null;
  property: { id: number; name: string } | null;
  total_readings: number;
  summary: HistorySensorSummary[];
  readings: HistoryReadingItem[];
};

export type ForecastDayItem = {
  date: string;
  temperature_max: number | null;
  temperature_min: number | null;
  precipitation_mm: number | null;
  precipitation_probability: number | null;
  wind_speed_max_kmh: number | null;
  weather_code: number | null;
  weather_description: string | null;
};

export type ForecastReport = {
  report_type: "forecast";
  generated_at: string;
  period: { from: string; to: string };
  station: {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
  };
  property: { id: number; name: string } | null;
  source: string;
  total_days: number;
  days: ForecastDayItem[];
};

export type AlertReportItem = {
  id: number;
  station_id: number;
  station_name: string;
  sensor_id: number;
  sensor_type: string;
  rule_name: string;
  condition: string;
  threshold_value: number;
  reading_value: number;
  unit_of_measure: string;
  triggered_at: string;
  status: "pending" | "acknowledged";
};

export type AlertsReport = {
  report_type: "alerts";
  generated_at: string;
  period: { from: string; to: string };
  station: { id: number; name: string } | null;
  property: { id: number; name: string } | null;
  total_alerts: number;
  alerts: AlertReportItem[];
};

export type MeteorologicalReport =
  HistoryReport | ForecastReport | AlertsReport;
