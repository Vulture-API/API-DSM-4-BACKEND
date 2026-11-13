import {
  filterReportAlerts,
  filterReportReadings,
} from "@/modules/reports/utils/report-filter.rules.js";

export type ReportStationInfo = {
  id: number;
  name: string;
  latitude: number | null;
  longitude: number | null;
  property_id: number;
  property_name: string;
};

export type ReportPropertyInfo = {
  id: number;
  name: string;
};

export type ReportReadingRow = {
  id: number;
  station_id?: number;
  sensor_id: number;
  sensor_type_id: number;
  sensor_type: string;
  unit_of_measure: string;
  value: number;
  unix_time: number;
  data_consistent: boolean;
};

export type ReportAlertRow = {
  id: number;
  station_id: number;
  station_name: string;
  sensor_id: number;
  sensor_type: string;
  unit_of_measure: string;
  rule_name: string;
  condition: string;
  threshold_value: number;
  reading_value: number;
  triggered_at: string;
  status: "pending" | "acknowledged";
};

export type ReportForecastRow = {
  date: string;
  temperature_max: number | null;
  temperature_min: number | null;
  precipitation_mm: number | null;
  precipitation_probability: number | null;
  wind_speed_max_kmh: number | null;
  weather_code: number | null;
};

export type ReportQueryFilters = {
  station_id?: number | undefined;
  property_id?: number | undefined;
  from_unix: number;
  to_unix: number;
};

export type ReportAlertFilters = {
  station_id?: number | undefined;
  property_id?: number | undefined;
  from_date: Date;
  to_date: Date;
};

export type ReportForecastQuery = {
  station_id: number;
  latitude: number;
  longitude: number;
  days: number;
};

export interface ReportRepository {
  getStationInfo(stationId: number): Promise<ReportStationInfo | null>;
  getPropertyInfo(propertyId: number): Promise<ReportPropertyInfo | null>;
  getReadings(filters: ReportQueryFilters): Promise<ReportReadingRow[]>;
  getAlerts(filters: ReportAlertFilters): Promise<ReportAlertRow[]>;
  getForecast(
    query: ReportForecastQuery,
  ): Promise<{ source: string; days: ReportForecastRow[] }>;
}

export class InMemoryReportRepository implements ReportRepository {
  public stations: ReportStationInfo[] = [];
  public properties: ReportPropertyInfo[] = [];
  public readings: ReportReadingRow[] = [];
  public alerts: ReportAlertRow[] = [];
  public forecastDays: ReportForecastRow[] = [];
  public forecastSource: string = "Open-Meteo";

  async getStationInfo(stationId: number): Promise<ReportStationInfo | null> {
    return this.stations.find((s) => s.id === stationId) ?? null;
  }

  async getPropertyInfo(
    propertyId: number,
  ): Promise<ReportPropertyInfo | null> {
    return this.properties.find((p) => p.id === propertyId) ?? null;
  }

  async getReadings(filters: ReportQueryFilters): Promise<ReportReadingRow[]> {
    return filterReportReadings(this.readings, filters, this.stations);
  }

  async getAlerts(filters: ReportAlertFilters): Promise<ReportAlertRow[]> {
    return filterReportAlerts(this.alerts, filters, this.stations);
  }

  async getForecast(
    query: ReportForecastQuery,
  ): Promise<{ source: string; days: ReportForecastRow[] }> {
    return {
      source: this.forecastSource,
      days: this.forecastDays.slice(0, query.days),
    };
  }
}
