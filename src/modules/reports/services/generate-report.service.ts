import { ReportPropertyNotFoundError } from "@/modules/reports/errors/report-property-not-found.error.js";
import { ReportStationNotFoundError } from "@/modules/reports/errors/report-station-not-found.error.js";
import { StationCoordinatesMissingError } from "@/modules/reports/errors/station-coordinates-missing.error.js";
import { StationRequiredForForecastError } from "@/modules/reports/errors/station-required-for-forecast.error.js";
import type {
  ReportForecastRow,
  ReportRepository,
} from "@/modules/reports/repositories/report.repository.js";
import type {
  AlertReportItem,
  AlertsReport,
  ForecastDayItem,
  ForecastReport,
  GenerateReportInput,
  HistoryReadingItem,
  HistoryReport,
  HistorySensorSummary,
  MeteorologicalReport,
} from "@/modules/reports/types/report.type.js";
import {
  DEFAULT_FORECAST_DAYS,
  DEFAULT_REPORT_PERIOD_DAYS,
  MAX_FORECAST_DAYS,
  MAX_REPORT_PERIOD_DAYS,
  type NormalizedForecastPeriod,
  type NormalizedReportPeriod,
  normalizeReportFilters,
} from "@/modules/reports/utils/report-filter.rules.js";

type Clock = () => Date;

export {
  DEFAULT_FORECAST_DAYS,
  DEFAULT_REPORT_PERIOD_DAYS,
  MAX_FORECAST_DAYS,
  MAX_REPORT_PERIOD_DAYS,
};

export function getWeatherDescription(code: number | null): string | null {
  if (code === null || code === undefined) return null;
  switch (code) {
    case 0:
      return "Céu limpo";
    case 1:
      return "Predominantemente limpo";
    case 2:
      return "Parcialmente nublado";
    case 3:
      return "Encoberto";
    case 45:
    case 48:
      return "Nevoeiro";
    case 51:
    case 53:
    case 55:
      return "Garoa";
    case 61:
    case 63:
    case 65:
      return "Chuva";
    case 71:
    case 73:
    case 75:
      return "Neve";
    case 80:
    case 81:
    case 82:
      return "Pancadas de chuva";
    case 95:
    case 96:
    case 99:
      return "Tempestade";
    default:
      return "Tempo instável";
  }
}

export class GenerateReportService {
  constructor(
    private readonly repository: ReportRepository,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async execute(input: GenerateReportInput): Promise<MeteorologicalReport> {
    const referenceNow = this.clock();
    const filters = normalizeReportFilters(input, referenceNow);

    let stationScope: {
      id: number;
      name: string;
      latitude: number | null;
      longitude: number | null;
    } | null = null;
    let propertyScope: { id: number; name: string } | null = null;
    let resolvedStationPropertyId: number | null = null;

    if (filters.station_id !== undefined) {
      const station = await this.repository.getStationInfo(filters.station_id);
      if (!station) {
        throw new ReportStationNotFoundError(filters.station_id);
      }
      stationScope = {
        id: station.id,
        name: station.name,
        latitude: station.latitude,
        longitude: station.longitude,
      };
      propertyScope = { id: station.property_id, name: station.property_name };
      resolvedStationPropertyId = station.property_id;
    }

    if (
      filters.property_id !== undefined &&
      filters.property_id !== resolvedStationPropertyId
    ) {
      const property = await this.repository.getPropertyInfo(
        filters.property_id,
      );
      if (!property) {
        throw new ReportPropertyNotFoundError(filters.property_id);
      }
      propertyScope = { id: property.id, name: property.name };
    }

    const generatedAt = referenceNow.toISOString();
    const period = {
      from: filters.period.from.toISOString(),
      to: filters.period.to.toISOString(),
    };

    switch (filters.report_type) {
      case "history":
        return this.generateHistoryReport({
          stationId: filters.station_id,
          propertyId: filters.property_id,
          normalizedPeriod: filters.period,
          generatedAt,
          period,
          stationScope,
          propertyScope,
        });

      case "forecast":
        return this.generateForecastReport({
          forecastPeriod: filters.forecast_period!,
          generatedAt,
          period,
          stationScope,
          propertyScope,
        });

      case "alerts":
        return this.generateAlertsReport({
          stationId: filters.station_id,
          propertyId: filters.property_id,
          normalizedPeriod: filters.period,
          generatedAt,
          period,
          stationScope,
          propertyScope,
        });
    }
  }

  private async generateHistoryReport(params: {
    stationId?: number | undefined;
    propertyId?: number | undefined;
    normalizedPeriod: NormalizedReportPeriod;
    generatedAt: string;
    period: { from: string; to: string };
    stationScope: { id: number; name: string } | null;
    propertyScope: { id: number; name: string } | null;
  }): Promise<HistoryReport> {
    const rawReadings = await this.repository.getReadings({
      station_id: params.stationId,
      property_id: params.propertyId,
      from_unix: params.normalizedPeriod.from_unix,
      to_unix: params.normalizedPeriod.to_unix,
    });

    const readings: HistoryReadingItem[] = rawReadings
      .sort((a, b) => a.unix_time - b.unix_time || a.id - b.id)
      .map((r) => ({
        id: r.id,
        sensor_id: r.sensor_id,
        sensor_type_id: r.sensor_type_id,
        sensor_type: r.sensor_type,
        unit_of_measure: r.unit_of_measure,
        value: r.value,
        unix_time: r.unix_time,
        date_time: new Date(r.unix_time * 1000).toISOString(),
        data_consistent: r.data_consistent,
      }));

    const bySensorType = new Map<
      number,
      {
        sensor_type_id: number;
        sensor_type: string;
        unit_of_measure: string;
        values: number[];
      }
    >();

    for (const r of readings) {
      let group = bySensorType.get(r.sensor_type_id);
      if (!group) {
        group = {
          sensor_type_id: r.sensor_type_id,
          sensor_type: r.sensor_type,
          unit_of_measure: r.unit_of_measure,
          values: [],
        };
        bySensorType.set(r.sensor_type_id, group);
      }
      group.values.push(r.value);
    }

    const summary: HistorySensorSummary[] = Array.from(bySensorType.values())
      .map((g) => {
        const count = g.values.length;
        const sum = g.values.reduce((acc, v) => acc + v, 0);
        const avg = count > 0 ? Number((sum / count).toFixed(2)) : 0;
        const min = count > 0 ? Math.min(...g.values) : 0;
        const max = count > 0 ? Math.max(...g.values) : 0;

        let stddev: number | null = null;
        if (count > 1) {
          const variance =
            g.values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / count;
          stddev = Number(Math.sqrt(variance).toFixed(2));
        }

        const isRain =
          g.sensor_type.toLowerCase().includes("pluvio") ||
          g.sensor_type.toLowerCase().includes("chuva") ||
          g.unit_of_measure.toLowerCase() === "mm";

        const accumulated = isRain ? Number(sum.toFixed(2)) : null;

        return {
          sensor_type_id: g.sensor_type_id,
          sensor_type: g.sensor_type,
          unit_of_measure: g.unit_of_measure,
          count,
          avg,
          min,
          max,
          stddev,
          accumulated,
        };
      })
      .sort((a, b) => a.sensor_type_id - b.sensor_type_id);

    return {
      report_type: "history",
      generated_at: params.generatedAt,
      period: params.period,
      station: params.stationScope
        ? { id: params.stationScope.id, name: params.stationScope.name }
        : null,
      property: params.propertyScope,
      total_readings: readings.length,
      summary,
      readings,
    };
  }

  private async generateForecastReport(params: {
    forecastPeriod: NormalizedForecastPeriod;
    generatedAt: string;
    period: { from: string; to: string };
    stationScope: {
      id: number;
      name: string;
      latitude: number | null;
      longitude: number | null;
    } | null;
    propertyScope: { id: number; name: string } | null;
  }): Promise<ForecastReport> {
    if (!params.stationScope) {
      throw new StationRequiredForForecastError();
    }

    if (
      params.stationScope.latitude === null ||
      params.stationScope.longitude === null
    ) {
      throw new StationCoordinatesMissingError(
        params.stationScope.id,
        params.stationScope.name,
      );
    }

    const result = await this.repository.getForecast({
      station_id: params.stationScope.id,
      latitude: params.stationScope.latitude,
      longitude: params.stationScope.longitude,
      days: params.forecastPeriod.days,
    });

    const days: ForecastDayItem[] = result.days.map((d: ReportForecastRow) => ({
      date: d.date,
      temperature_max: d.temperature_max,
      temperature_min: d.temperature_min,
      precipitation_mm: d.precipitation_mm,
      precipitation_probability: d.precipitation_probability,
      wind_speed_max_kmh: d.wind_speed_max_kmh,
      weather_code: d.weather_code,
      weather_description: getWeatherDescription(d.weather_code),
    }));

    return {
      report_type: "forecast",
      generated_at: params.generatedAt,
      period: params.period,
      station: {
        id: params.stationScope.id,
        name: params.stationScope.name,
        latitude: params.stationScope.latitude,
        longitude: params.stationScope.longitude,
      },
      property: params.propertyScope,
      source: result.source,
      total_days: days.length,
      days,
    };
  }

  private async generateAlertsReport(params: {
    stationId?: number | undefined;
    propertyId?: number | undefined;
    normalizedPeriod: NormalizedReportPeriod;
    generatedAt: string;
    period: { from: string; to: string };
    stationScope: { id: number; name: string } | null;
    propertyScope: { id: number; name: string } | null;
  }): Promise<AlertsReport> {
    const rawAlerts = await this.repository.getAlerts({
      station_id: params.stationId,
      property_id: params.propertyId,
      from_date: params.normalizedPeriod.from,
      to_date: params.normalizedPeriod.to,
    });

    const alerts: AlertReportItem[] = rawAlerts
      .sort(
        (a, b) =>
          new Date(b.triggered_at).getTime() -
            new Date(a.triggered_at).getTime() || b.id - a.id,
      )
      .map((a) => ({
        id: a.id,
        station_id: a.station_id,
        station_name: a.station_name,
        sensor_id: a.sensor_id,
        sensor_type: a.sensor_type,
        rule_name: a.rule_name,
        condition: a.condition,
        threshold_value: a.threshold_value,
        reading_value: a.reading_value,
        unit_of_measure: a.unit_of_measure,
        triggered_at: a.triggered_at,
        status: a.status,
      }));

    return {
      report_type: "alerts",
      generated_at: params.generatedAt,
      period: params.period,
      station: params.stationScope
        ? { id: params.stationScope.id, name: params.stationScope.name }
        : null,
      property: params.propertyScope,
      total_alerts: alerts.length,
      alerts,
    };
  }
}
