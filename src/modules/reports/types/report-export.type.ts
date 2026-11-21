import type {
  CanonicalReportType,
  HistorySensorSummary,
  MeteorologicalReport,
} from "@/modules/reports/types/report.type.js";

export type ExportFormat = "csv" | "json";

export type ExportReportInput = {
  report: MeteorologicalReport;
  format: string;
  allowEmpty?: boolean | undefined;
};

export type ExportedReportStationFilter = {
  id: number;
  name: string;
  latitude?: number;
  longitude?: number;
};

export type ExportedReportFilters = {
  report_type: CanonicalReportType;
  period: {
    from: string;
    to: string;
  };
  station: ExportedReportStationFilter | null;
  property: {
    id: number;
    name: string;
  } | null;
};

export type PreparedReportCell = string | number | boolean | null;

export type PreparedReportRow = Record<string, PreparedReportCell>;

export type PreparedReportExport = {
  reportType: CanonicalReportType;
  generatedAt: string;
  filters: ExportedReportFilters;
  columns: string[];
  rows: PreparedReportRow[];
  summary?: HistorySensorSummary[];
  totalRecords: number;
  isEmpty: boolean;
};

export type ExportedReportResult = {
  format: ExportFormat;
  filename: string;
  contentType: string;
  extension: string;
  content: string;
  byteLength: number;
  totalRecords: number;
  isEmpty: boolean;
  filters: ExportedReportFilters;
  generatedAt: string;
};
