import z from "zod";

import {
  isValidDateParameter,
  isValidIsoDateTimeString,
} from "@/modules/readings/utils/date-filter.js";
import {
  MAX_FORECAST_DAYS,
  MAX_PG_INT,
  normalizeReportDateBoundary,
} from "@/modules/reports/utils/report-filter.rules.js";

const DIGITS_ONLY = /^\d+$/;

const emptyToUndefined = (value: unknown) =>
  value === null || value === undefined || value === "" ? undefined : value;

const positivePgInt = z.number().int().positive().max(MAX_PG_INT);

const optionalPositiveInt = z.preprocess(
  emptyToUndefined,
  z
    .union([
      positivePgInt,
      z
        .string()
        .trim()
        .regex(DIGITS_ONLY)
        .transform(Number)
        .pipe(positivePgInt),
    ])
    .optional(),
);

const forecastDaysInt = z.number().int().min(1).max(MAX_FORECAST_DAYS);

const optionalForecastDays = z.preprocess(
  emptyToUndefined,
  z
    .union([
      forecastDaysInt,
      z
        .string()
        .trim()
        .regex(DIGITS_ONLY)
        .transform(Number)
        .pipe(forecastDaysInt),
    ])
    .optional(),
);

function optionalDateBoundary(boundary: "start" | "end") {
  return z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .refine((value) => isValidDateParameter(value), {
        message:
          "Invalid date format. Expected YYYY-MM-DD or ISO 8601 datetime.",
      })
      .transform((value) => normalizeReportDateBoundary(value, boundary))
      .refine((value) => isValidIsoDateTimeString(value), {
        message: "Invalid ISO 8601 datetime.",
      })
      .optional(),
  );
}

const optionalReportType = z.preprocess(
  (value) => (value === null || value === undefined ? "" : value),
  z.string().trim(),
);

export const reportRequestSchema = z
  .object({
    type: optionalReportType,
    station_id: optionalPositiveInt,
    property_id: optionalPositiveInt,
    from: optionalDateBoundary("start"),
    to: optionalDateBoundary("end"),
    days: optionalForecastDays,
  })
  .strict();

export type ReportRequestInput = z.infer<typeof reportRequestSchema>;
