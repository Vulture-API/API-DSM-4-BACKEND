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

const optionalBodyReportType = z.preprocess(
  (value) => (value === null ? "" : value),
  z.string().trim().optional(),
);

const optionalExportFormat = z.preprocess(
  (value) => (value === null || value === undefined ? "" : value),
  z.string().trim(),
);

const optionalAllowEmpty = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean().optional());

const reportScopeAndPeriodFields = {
  station_id: optionalPositiveInt,
  property_id: optionalPositiveInt,
  from: optionalDateBoundary("start"),
  to: optionalDateBoundary("end"),
  days: optionalForecastDays,
};

export const reportRequestSchema = z
  .object({
    type: optionalReportType,
    ...reportScopeAndPeriodFields,
  })
  .strict();

export const exportReportQuerySchema = z
  .object({
    type: optionalReportType,
    ...reportScopeAndPeriodFields,
    format: optionalExportFormat,
    allow_empty: optionalAllowEmpty,
  })
  .strict();

export const exportReportBodySchema = z
  .object({
    report: z.unknown().optional(),
    type: optionalBodyReportType,
    ...reportScopeAndPeriodFields,
    format: optionalExportFormat,
    allow_empty: optionalAllowEmpty,
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasReport = data.report !== undefined;
    const hasGenerationFilters = [
      data.type,
      data.station_id,
      data.property_id,
      data.from,
      data.to,
      data.days,
    ].some((value) => value !== undefined);

    if (hasReport && hasGenerationFilters) {
      ctx.addIssue({
        code: "custom",
        message: "Do not combine 'report' with report generation filters.",
      });
    }
  });

export type ReportRequestInput = z.infer<typeof reportRequestSchema>;
export type ExportReportQueryInput = z.infer<typeof exportReportQuerySchema>;
export type ExportReportBodyInput = z.infer<typeof exportReportBodySchema>;
