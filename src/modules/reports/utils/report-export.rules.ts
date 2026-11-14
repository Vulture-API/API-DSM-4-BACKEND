import { EmptyReportExportError } from "@/modules/reports/errors/empty-report-export.error.js";
import { InvalidExportFormatError } from "@/modules/reports/errors/invalid-export-format.error.js";
import { InvalidExportReportPayloadError } from "@/modules/reports/errors/invalid-export-report-payload.error.js";
import type {
  AlertsReport,
  CanonicalReportType,
  ForecastReport,
  HistoryReport,
  MeteorologicalReport,
} from "@/modules/reports/types/report.type.js";
import type {
  ExportedReportFilters,
  ExportedReportResult,
  ExportedReportStationFilter,
  ExportFormat,
  ExportReportInput,
  PreparedReportCell,
  PreparedReportExport,
  PreparedReportRow,
} from "@/modules/reports/types/report-export.type.js";

const CSV_UTF8_BOM = "\uFEFF";

const EXPORT_FORMAT_ALIASES: Record<string, ExportFormat> = {
  csv: "csv",
  "text/csv": "csv",
  json: "json",
  "application/json": "json",
};

const EXPORT_FORMAT_METADATA: Record<
  ExportFormat,
  { contentType: string; extension: string }
> = {
  csv: {
    contentType: "text/csv; charset=utf-8",
    extension: "csv",
  },
  json: {
    contentType: "application/json; charset=utf-8",
    extension: "json",
  },
};

const REPORT_TYPE_SLUGS: Record<CanonicalReportType, string> = {
  history: "historico",
  forecast: "previsao",
  alerts: "alertas",
};

const HISTORY_COLUMNS = [
  "ID Leitura",
  "Estação",
  "Propriedade",
  "Sensor ID",
  "Parâmetro",
  "Valor",
  "Unidade",
  "Data/Hora ISO",
  "Consistente",
];

const FORECAST_COLUMNS = [
  "Data",
  "Estação",
  "Propriedade",
  "Temp Min (°C)",
  "Temp Max (°C)",
  "Chuva (mm)",
  "Probabilidade Chuva (%)",
  "Vento Max (km/h)",
  "Código WMO",
  "Condição",
];

const ALERTS_COLUMNS = [
  "ID Alerta",
  "Estação",
  "Propriedade",
  "Sensor ID",
  "Parâmetro",
  "Regra",
  "Condição",
  "Limite",
  "Valor Medido",
  "Unidade",
  "Disparado Em",
  "Status",
];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidIsoDateString(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }
  return !Number.isNaN(new Date(value).getTime());
}

function cloneStationFilter(
  station: MeteorologicalReport["station"],
): ExportedReportStationFilter | null {
  if (!station) {
    return null;
  }

  const cloned: ExportedReportStationFilter = {
    id: station.id,
    name: station.name,
  };

  if ("latitude" in station && typeof station.latitude === "number") {
    cloned.latitude = station.latitude;
  }
  if ("longitude" in station && typeof station.longitude === "number") {
    cloned.longitude = station.longitude;
  }

  return cloned;
}

/** Normaliza e valida o formato de exportação solicitado. */
export function resolveExportFormat(rawFormat: unknown): ExportFormat {
  if (typeof rawFormat !== "string") {
    throw new InvalidExportFormatError();
  }

  const normalized = rawFormat.trim().toLowerCase().replace(/^\./, "");
  const resolved = EXPORT_FORMAT_ALIASES[normalized];
  if (!resolved) {
    throw new InvalidExportFormatError(rawFormat);
  }

  return resolved;
}

/** Valida a estrutura básica do relatório antes de prepará-lo para exportação. */
export function validateReportForExport(
  rawReport: unknown,
): MeteorologicalReport {
  if (!isPlainRecord(rawReport)) {
    throw new InvalidExportReportPayloadError(
      "é obrigatório fornecer um objeto de relatório válido.",
    );
  }

  const reportType = rawReport.report_type;
  if (
    reportType !== "history" &&
    reportType !== "forecast" &&
    reportType !== "alerts"
  ) {
    throw new InvalidExportReportPayloadError(
      "o campo 'report_type' deve ser 'history', 'forecast' ou 'alerts'.",
    );
  }

  if (!isValidIsoDateString(rawReport.generated_at)) {
    throw new InvalidExportReportPayloadError(
      "o campo 'generated_at' deve ser uma data válida.",
    );
  }

  if (!isPlainRecord(rawReport.period)) {
    throw new InvalidExportReportPayloadError(
      "o campo 'period' é obrigatório e deve conter 'from' e 'to'.",
    );
  }

  const { from, to } = rawReport.period;
  if (!isValidIsoDateString(from) || !isValidIsoDateString(to)) {
    throw new InvalidExportReportPayloadError(
      "as datas 'period.from' e 'period.to' devem ser datas válidas.",
    );
  }

  if (new Date(from).getTime() > new Date(to).getTime()) {
    throw new InvalidExportReportPayloadError(
      "a data inicial 'period.from' não pode ser posterior a 'period.to'.",
    );
  }

  if (reportType === "history" && !Array.isArray(rawReport.readings)) {
    throw new InvalidExportReportPayloadError(
      "o relatório histórico deve conter uma lista válida em 'readings'.",
    );
  }

  if (reportType === "forecast") {
    if (
      !isPlainRecord(rawReport.station) ||
      typeof rawReport.station.id !== "number" ||
      typeof rawReport.station.name !== "string"
    ) {
      throw new InvalidExportReportPayloadError(
        "o relatório de previsões deve conter os metadados válidos da estação em 'station' (id e name).",
      );
    }
    if (!Array.isArray(rawReport.days)) {
      throw new InvalidExportReportPayloadError(
        "o relatório de previsões deve conter uma lista válida em 'days'.",
      );
    }
  }

  if (reportType === "alerts" && !Array.isArray(rawReport.alerts)) {
    throw new InvalidExportReportPayloadError(
      "o relatório de alertas deve conter uma lista válida em 'alerts'.",
    );
  }

  return rawReport as unknown as MeteorologicalReport;
}

/** Extrai cópia imutável dos filtros aplicados ao relatório. */
export function extractReportFilters(
  report: MeteorologicalReport,
): ExportedReportFilters {
  return {
    report_type: report.report_type,
    period: {
      from: report.period.from,
      to: report.period.to,
    },
    station: cloneStationFilter(report.station),
    property: report.property
      ? { id: report.property.id, name: report.property.name }
      : null,
  };
}

/** Escapa valores de células para CSV seguindo RFC 4180 e normalizando quebras de linha. */
export function escapeCsvCell(value: PreparedReportCell | undefined): string {
  if (value === null || value === undefined) {
    return '""';
  }

  const normalized = String(value)
    .replace(/\r?\n|\r/g, " ")
    .replace(/"/g, '""');

  return `"${normalized}"`;
}

function prepareHistoryRows(report: HistoryReport): PreparedReportRow[] {
  const stationName = report.station?.name ?? "Todas";
  const propertyName = report.property?.name ?? "Todas";

  return [...report.readings]
    .sort((a, b) => a.unix_time - b.unix_time || a.id - b.id)
    .map((reading) => ({
      "ID Leitura": reading.id,
      Estação: stationName,
      Propriedade: propertyName,
      "Sensor ID": reading.sensor_id,
      Parâmetro: reading.sensor_type,
      Valor: reading.value,
      Unidade: reading.unit_of_measure,
      "Data/Hora ISO": reading.date_time,
      Consistente: reading.data_consistent ? "Sim" : "Não",
    }));
}

function prepareForecastRows(report: ForecastReport): PreparedReportRow[] {
  const stationName = report.station.name;
  const propertyName = report.property?.name ?? "Todas";

  return [...report.days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      Data: day.date,
      Estação: stationName,
      Propriedade: propertyName,
      "Temp Min (°C)": day.temperature_min,
      "Temp Max (°C)": day.temperature_max,
      "Chuva (mm)": day.precipitation_mm,
      "Probabilidade Chuva (%)": day.precipitation_probability,
      "Vento Max (km/h)": day.wind_speed_max_kmh,
      "Código WMO": day.weather_code,
      Condição: day.weather_description,
    }));
}

function prepareAlertsRows(report: AlertsReport): PreparedReportRow[] {
  const propertyName = report.property?.name ?? "Todas";

  return [...report.alerts]
    .sort(
      (a, b) =>
        new Date(b.triggered_at).getTime() -
          new Date(a.triggered_at).getTime() || b.id - a.id,
    )
    .map((alert) => ({
      "ID Alerta": alert.id,
      Estação: alert.station_name,
      Propriedade: propertyName,
      "Sensor ID": alert.sensor_id,
      Parâmetro: alert.sensor_type,
      Regra: alert.rule_name,
      Condição: alert.condition,
      Limite: alert.threshold_value,
      "Valor Medido": alert.reading_value,
      Unidade: alert.unit_of_measure,
      "Disparado Em": alert.triggered_at,
      Status: alert.status === "acknowledged" ? "Reconhecido" : "Pendente",
    }));
}

/** Prepara estrutura tabular normalizada e filtros preservados para exportação. */
export function prepareReportForExport(
  rawReport: MeteorologicalReport,
): PreparedReportExport {
  const report = validateReportForExport(rawReport);
  const filters = extractReportFilters(report);

  if (report.report_type === "history") {
    const rows = prepareHistoryRows(report);
    const summary = Array.isArray(report.summary)
      ? report.summary.map((item) => ({ ...item }))
      : [];

    return {
      reportType: "history",
      generatedAt: report.generated_at,
      filters,
      columns: [...HISTORY_COLUMNS],
      rows,
      summary,
      totalRecords: rows.length,
      isEmpty: rows.length === 0,
    };
  }

  if (report.report_type === "forecast") {
    const rows = prepareForecastRows(report);
    return {
      reportType: "forecast",
      generatedAt: report.generated_at,
      filters,
      columns: [...FORECAST_COLUMNS],
      rows,
      totalRecords: rows.length,
      isEmpty: rows.length === 0,
    };
  }

  const rows = prepareAlertsRows(report);
  return {
    reportType: "alerts",
    generatedAt: report.generated_at,
    filters,
    columns: [...ALERTS_COLUMNS],
    rows,
    totalRecords: rows.length,
    isEmpty: rows.length === 0,
  };
}

/** Gera nome padronizado de arquivo contendo tipo, escopo e período filtrado. */
export function buildExportFilename(
  filters: ExportedReportFilters,
  format: ExportFormat,
): string {
  const typeSlug = REPORT_TYPE_SLUGS[filters.report_type];
  const scopeSlug = filters.station
    ? `estacao-${filters.station.id}`
    : filters.property
      ? `propriedade-${filters.property.id}`
      : "geral";
  const fromDate = filters.period.from.slice(0, 10);
  const toDate = filters.period.to.slice(0, 10);
  const { extension } = EXPORT_FORMAT_METADATA[format];

  return `relatorio-${typeSlug}-${scopeSlug}-${fromDate}_a_${toDate}.${extension}`;
}

/** Formata os dados preparados em CSV delimitado por ponto e vírgula com BOM UTF-8. */
export function formatPreparedReportAsCsv(
  prepared: PreparedReportExport,
): string {
  const headerLine = prepared.columns
    .map((col) => escapeCsvCell(col))
    .join(";");
  const dataLines = prepared.rows.map((row) =>
    prepared.columns.map((col) => escapeCsvCell(row[col])).join(";"),
  );

  return `${CSV_UTF8_BOM}${[headerLine, ...dataLines].join("\r\n")}`;
}

/** Formata os dados preparados em JSON estruturado preservando filtros e metadados. */
export function formatPreparedReportAsJson(
  prepared: PreparedReportExport,
): string {
  const payload = {
    report_type: prepared.reportType,
    generated_at: prepared.generatedAt,
    filters: prepared.filters,
    total_records: prepared.totalRecords,
    ...(prepared.summary !== undefined ? { summary: prepared.summary } : {}),
    data: prepared.rows,
  };

  return JSON.stringify(payload, null, 2);
}

/** Aplica validação, preparação e formatação completas para exportação de relatório. */
export function exportReport(input: ExportReportInput): ExportedReportResult {
  if (!isPlainRecord(input)) {
    throw new InvalidExportReportPayloadError(
      "é obrigatório informar um objeto contendo 'report' e 'format'.",
    );
  }

  const format = resolveExportFormat(input.format);
  const prepared = prepareReportForExport(input.report);

  if (prepared.isEmpty && !input.allowEmpty) {
    throw new EmptyReportExportError(prepared.filters);
  }

  const content =
    format === "csv"
      ? formatPreparedReportAsCsv(prepared)
      : formatPreparedReportAsJson(prepared);

  const { contentType, extension } = EXPORT_FORMAT_METADATA[format];
  const filename = buildExportFilename(prepared.filters, format);

  return {
    format,
    filename,
    contentType,
    extension,
    content,
    byteLength: Buffer.byteLength(content, "utf8"),
    totalRecords: prepared.totalRecords,
    isEmpty: prepared.isEmpty,
    filters: prepared.filters,
    generatedAt: prepared.generatedAt,
  };
}
