import { ApplicationError } from "@/errors/application.error.js";
import {
  isValidDateOnlyString,
  isValidDateParameter,
  isValidIsoDateTimeString,
  parseEndDateToUnix,
  parseStartDateToUnix,
} from "@/modules/readings/utils/date-filter.js";
import { InvalidReportPeriodError } from "@/modules/reports/errors/invalid-report-period.error.js";
import { InvalidReportTypeError } from "@/modules/reports/errors/invalid-report-type.error.js";
import { ReportPropertyNotFoundError } from "@/modules/reports/errors/report-property-not-found.error.js";
import { ReportStationNotFoundError } from "@/modules/reports/errors/report-station-not-found.error.js";
import type {
  ReportAlertFilters,
  ReportAlertRow,
  ReportPropertyInfo,
  ReportQueryFilters,
  ReportReadingRow,
  ReportStationInfo,
} from "@/modules/reports/repositories/report.repository.js";
import type {
  CanonicalReportType,
  GenerateReportInput,
} from "@/modules/reports/types/report.type.js";

export const DEFAULT_REPORT_PERIOD_DAYS = 7;
export const MAX_REPORT_PERIOD_DAYS = 366;
export const DEFAULT_FORECAST_DAYS = 7;
export const MAX_FORECAST_DAYS = 16;
export const MAX_PG_INT = 2_147_483_647;
const DAY_MS = 86_400_000;
const HAS_TIMEZONE_SUFFIX = /(Z|[+-]\d{2}(?::?\d{2})?)$/i;

const REPORT_TYPE_ALIASES: Record<string, CanonicalReportType> = {
  history: "history",
  historico: "history",
  leituras: "history",
  dados: "history",
  synthetic: "history",
  analytical: "history",
  sintetico: "history",
  analitico: "history",
  forecast: "forecast",
  previsao: "forecast",
  previsoes: "forecast",
  tempo: "forecast",
  alerts: "alerts",
  alertas: "alerts",
  ocorrencias: "alerts",
};

/** Resolved period boundaries in Date and UTC Unix seconds. */
export type NormalizedReportPeriod = {
  from: Date;
  to: Date;
  from_unix: number;
  to_unix: number;
};

/** Resolved forecast horizon in days and UTC boundaries. */
export type NormalizedForecastPeriod = {
  days: number;
  from: Date;
  to: Date;
};

/** Validated and normalized filters ready for report execution. */
export type NormalizedReportFilters = {
  report_type: CanonicalReportType;
  station_id?: number | undefined;
  property_id?: number | undefined;
  period: NormalizedReportPeriod;
  forecast_period?: NormalizedForecastPeriod | undefined;
};

function isOmittedValue(value: unknown): value is undefined | null | "" {
  return value === undefined || value === null || value === "";
}

/** Normalizes localized report type aliases into canonical report identifiers. */
export function resolveReportType(rawType: string): CanonicalReportType {
  const normalized = (rawType || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const canonical = REPORT_TYPE_ALIASES[normalized];
  if (!canonical) {
    throw new InvalidReportTypeError(rawType);
  }
  return canonical;
}

/** Expands YYYY-MM-DD and offsetless ISO timestamps to explicit UTC ISO boundaries. */
export function normalizeReportDateBoundary(
  value: string,
  boundary: "start" | "end",
): string {
  if (isValidDateOnlyString(value)) {
    return boundary === "start"
      ? `${value}T00:00:00.000Z`
      : `${value}T23:59:59.999Z`;
  }
  return HAS_TIMEZONE_SUFFIX.test(value) ? value : `${value}Z`;
}

/** Parses and validates a report boundary date using strict calendar rules. */
export function parseReportBoundaryDate(
  rawValue: Date | string,
  field: "from" | "to",
  boundary: "start" | "end",
): Date {
  if (rawValue instanceof Date) {
    if (Number.isNaN(rawValue.getTime())) {
      throw InvalidReportPeriodError.invalidFormat(field, rawValue);
    }
    return new Date(rawValue.getTime());
  }

  if (typeof rawValue !== "string") {
    throw InvalidReportPeriodError.invalidFormat(field, rawValue);
  }

  const trimmed = rawValue.trim();
  if (!trimmed || !isValidDateParameter(trimmed)) {
    throw InvalidReportPeriodError.invalidFormat(field, rawValue);
  }

  const normalizedIso = normalizeReportDateBoundary(trimmed, boundary);
  if (!isValidIsoDateTimeString(normalizedIso)) {
    throw InvalidReportPeriodError.invalidFormat(field, rawValue);
  }

  const parsed = new Date(normalizedIso);
  if (Number.isNaN(parsed.getTime())) {
    throw InvalidReportPeriodError.invalidFormat(field, rawValue);
  }
  return parsed;
}

function toUnixBoundary(
  rawValue: Date | string | null | undefined,
  resolvedDate: Date,
  boundary: "start" | "end",
): number {
  if (!isOmittedValue(rawValue) && typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    return boundary === "start"
      ? parseStartDateToUnix(trimmed)
      : parseEndDateToUnix(trimmed);
  }
  return Math.floor(resolvedDate.getTime() / 1000);
}

/** Validates optional integer scope IDs (station_id, property_id) against PostgreSQL int bounds. */
export function normalizeOptionalScopeId(
  rawValue: unknown,
  field: "station_id" | "property_id",
): number | undefined {
  if (isOmittedValue(rawValue)) {
    return undefined;
  }

  if (
    typeof rawValue !== "number" ||
    !Number.isInteger(rawValue) ||
    rawValue < 1 ||
    rawValue > MAX_PG_INT
  ) {
    throw new ApplicationError(
      400,
      "INVALID_REPORT_FILTER",
      `O campo '${field}' deve ser um identificador inteiro positivo válido.`,
    );
  }

  return rawValue;
}

/** Resolves and validates the reporting period for history and alerts reports. */
export function resolveReportPeriod(
  input: {
    from?: Date | string | null | undefined;
    to?: Date | string | null | undefined;
  },
  referenceNow: Date = new Date(),
): NormalizedReportPeriod {
  const to = !isOmittedValue(input.to)
    ? parseReportBoundaryDate(input.to, "to", "end")
    : new Date(referenceNow.getTime());

  const from = !isOmittedValue(input.from)
    ? parseReportBoundaryDate(input.from, "from", "start")
    : new Date(to.getTime() - DEFAULT_REPORT_PERIOD_DAYS * DAY_MS);

  if (from.getTime() >= to.getTime()) {
    throw InvalidReportPeriodError.inverted(from, to);
  }

  const diffDays = Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
  if (diffDays > MAX_REPORT_PERIOD_DAYS) {
    throw InvalidReportPeriodError.periodTooLong(
      diffDays,
      MAX_REPORT_PERIOD_DAYS,
    );
  }

  return {
    from,
    to,
    from_unix: toUnixBoundary(input.from, from, "start"),
    to_unix: toUnixBoundary(input.to, to, "end"),
  };
}

/** Resolves and validates the forecast horizon from days or optional date boundaries. */
export function resolveForecastPeriod(
  input: {
    from?: Date | string | null | undefined;
    to?: Date | string | null | undefined;
    days?: number | null | undefined;
  },
  referenceNow: Date = new Date(),
): NormalizedForecastPeriod {
  let daysCount = DEFAULT_FORECAST_DAYS;
  if (input.days !== undefined && input.days !== null) {
    if (
      typeof input.days !== "number" ||
      !Number.isInteger(input.days) ||
      input.days < 1 ||
      input.days > MAX_FORECAST_DAYS
    ) {
      throw new InvalidReportPeriodError(
        `A quantidade de dias para previsão (${String(input.days)}) deve ser um número inteiro entre 1 e ${MAX_FORECAST_DAYS}.`,
      );
    }
    daysCount = input.days;
  }

  const fromBoundary = !isOmittedValue(input.from)
    ? parseReportBoundaryDate(input.from, "from", "start")
    : undefined;
  const toBoundary = !isOmittedValue(input.to)
    ? parseReportBoundaryDate(input.to, "to", "end")
    : undefined;

  if (fromBoundary && toBoundary) {
    if (fromBoundary.getTime() >= toBoundary.getTime()) {
      throw InvalidReportPeriodError.inverted(fromBoundary, toBoundary);
    }
    const diffDays = Math.ceil(
      (toBoundary.getTime() - fromBoundary.getTime()) / DAY_MS,
    );
    if (diffDays > MAX_REPORT_PERIOD_DAYS) {
      throw InvalidReportPeriodError.periodTooLong(
        diffDays,
        MAX_REPORT_PERIOD_DAYS,
      );
    }
    daysCount = Math.max(1, Math.min(MAX_FORECAST_DAYS, diffDays));
  } else if (toBoundary) {
    if (referenceNow.getTime() >= toBoundary.getTime()) {
      throw InvalidReportPeriodError.inverted(referenceNow, toBoundary);
    }
    const diffDays = Math.ceil(
      (toBoundary.getTime() - referenceNow.getTime()) / DAY_MS,
    );
    if (diffDays > MAX_REPORT_PERIOD_DAYS) {
      throw InvalidReportPeriodError.periodTooLong(
        diffDays,
        MAX_REPORT_PERIOD_DAYS,
      );
    }
    daysCount = Math.max(1, Math.min(MAX_FORECAST_DAYS, diffDays));
  }

  const from = new Date(referenceNow.getTime());
  const to = new Date(from.getTime() + daysCount * DAY_MS);

  return { days: daysCount, from, to };
}

/** Validates and normalizes all report filters without querying repositories. */
export function normalizeReportFilters(
  input: GenerateReportInput,
  referenceNow: Date = new Date(),
): NormalizedReportFilters {
  const reportType = resolveReportType(input.type);
  const stationId = normalizeOptionalScopeId(input.station_id, "station_id");
  const propertyId = normalizeOptionalScopeId(input.property_id, "property_id");

  if (reportType === "forecast") {
    const forecastPeriod = resolveForecastPeriod(
      { from: input.from, to: input.to, days: input.days },
      referenceNow,
    );
    return {
      report_type: reportType,
      station_id: stationId,
      property_id: propertyId,
      period: {
        from: forecastPeriod.from,
        to: forecastPeriod.to,
        from_unix: Math.floor(forecastPeriod.from.getTime() / 1000),
        to_unix: Math.floor(forecastPeriod.to.getTime() / 1000),
      },
      forecast_period: forecastPeriod,
    };
  }

  return {
    report_type: reportType,
    station_id: stationId,
    property_id: propertyId,
    period: resolveReportPeriod(
      { from: input.from, to: input.to },
      referenceNow,
    ),
  };
}

/** Resolves a station from a collection or throws ReportStationNotFoundError. */
export function resolveReportStationScope(
  stationId: number,
  stations: readonly ReportStationInfo[],
): ReportStationInfo {
  const station = stations.find((item) => item.id === stationId);
  if (!station) {
    throw new ReportStationNotFoundError(stationId);
  }
  return station;
}

/** Resolves a property from a collection or throws ReportPropertyNotFoundError. */
export function resolveReportPropertyScope(
  propertyId: number,
  properties: readonly ReportPropertyInfo[],
): ReportPropertyInfo {
  const property = properties.find((item) => item.id === propertyId);
  if (!property) {
    throw new ReportPropertyNotFoundError(propertyId);
  }
  return property;
}

function resolveAllowedStationIdsForProperty(
  propertyId: number | undefined,
  stations?: readonly ReportStationInfo[],
): Set<number> | null {
  if (propertyId === undefined || !stations) {
    return null;
  }
  return new Set(
    stations
      .filter((station) => station.property_id === propertyId)
      .map((station) => station.id),
  );
}

/** Filters reading rows in memory by UTC Unix period, station_id, and property_id. */
export function filterReportReadings(
  readings: readonly ReportReadingRow[],
  filters: ReportQueryFilters,
  stations?: readonly ReportStationInfo[],
): ReportReadingRow[] {
  const allowedStationIds = resolveAllowedStationIdsForProperty(
    filters.property_id,
    stations,
  );

  return readings.filter((reading) => {
    if (
      reading.unix_time < filters.from_unix ||
      reading.unix_time > filters.to_unix
    ) {
      return false;
    }

    if (
      filters.station_id !== undefined &&
      reading.station_id !== undefined &&
      reading.station_id !== filters.station_id
    ) {
      return false;
    }

    if (
      allowedStationIds !== null &&
      reading.station_id !== undefined &&
      !allowedStationIds.has(reading.station_id)
    ) {
      return false;
    }

    return true;
  });
}

/** Filters alert rows in memory by UTC period, station_id, and property_id. */
export function filterReportAlerts(
  alerts: readonly ReportAlertRow[],
  filters: ReportAlertFilters,
  stations?: readonly ReportStationInfo[],
): ReportAlertRow[] {
  const fromTime = filters.from_date.getTime();
  const toTime = filters.to_date.getTime();
  const allowedStationIds = resolveAllowedStationIdsForProperty(
    filters.property_id,
    stations,
  );

  return alerts.filter((alert) => {
    const alertTime = new Date(alert.triggered_at).getTime();
    if (Number.isNaN(alertTime) || alertTime < fromTime || alertTime > toTime) {
      return false;
    }

    if (
      filters.station_id !== undefined &&
      alert.station_id !== filters.station_id
    ) {
      return false;
    }

    if (
      allowedStationIds !== null &&
      !allowedStationIds.has(alert.station_id)
    ) {
      return false;
    }

    return true;
  });
}
