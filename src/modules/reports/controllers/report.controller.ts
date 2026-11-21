import type { FastifyReply, FastifyRequest } from "fastify";

import type {
  ExportReportBodyInput,
  ExportReportQueryInput,
  ReportRequestInput,
} from "@/modules/reports/schemas/report.schema.js";
import { ExportReportService } from "@/modules/reports/services/export-report.service.js";
import {
  DEFAULT_FORECAST_DAYS,
  DEFAULT_REPORT_PERIOD_DAYS,
  type GenerateReportService,
  MAX_FORECAST_DAYS,
  MAX_REPORT_PERIOD_DAYS,
} from "@/modules/reports/services/generate-report.service.js";
import type { MeteorologicalReport } from "@/modules/reports/types/report.type.js";
import type { ExportedReportResult } from "@/modules/reports/types/report-export.type.js";
import { buildExportContentDisposition } from "@/modules/reports/utils/report-export.rules.js";

const AVAILABLE_REPORT_TYPES = {
  types: [
    {
      type: "history",
      aliases: [
        "history",
        "historico",
        "histórico",
        "leituras",
        "dados",
        "synthetic",
        "analytical",
        "sintetico",
        "analitico",
      ],
      name: "Relatório de Histórico de Leituras",
      description:
        "Consolida leituras meteorológicas, médias, extremos, desvios padrão e chuva acumulada por tipo de sensor.",
      filters: {
        optional: ["station_id", "property_id", "from", "to"],
        default_period_days: DEFAULT_REPORT_PERIOD_DAYS,
        max_period_days: MAX_REPORT_PERIOD_DAYS,
      },
    },
    {
      type: "forecast",
      aliases: [
        "forecast",
        "previsao",
        "previsão",
        "previsoes",
        "previsões",
        "tempo",
      ],
      name: "Relatório de Previsão Meteorológica",
      description:
        "Apresenta a previsão diária de temperatura, precipitação, probabilidade de chuva, vento e condição meteorológica de uma estação.",
      filters: {
        required: ["station_id"],
        optional: ["days", "from", "to"],
        default_days: DEFAULT_FORECAST_DAYS,
        max_days: MAX_FORECAST_DAYS,
      },
    },
    {
      type: "alerts",
      aliases: ["alerts", "alertas", "ocorrencias", "ocorrências"],
      name: "Relatório de Alertas e Ocorrências",
      description:
        "Lista alertas disparados no período com regra configurada, valor medido, limite e status de reconhecimento.",
      filters: {
        optional: ["station_id", "property_id", "from", "to"],
        default_period_days: DEFAULT_REPORT_PERIOD_DAYS,
        max_period_days: MAX_REPORT_PERIOD_DAYS,
      },
    },
  ],
};

/**
 * Controlador HTTP responsavel pela solicitacao e consulta dos relatorios meteorologicos.
 */
export class ReportController {
  private readonly exportReportService: ExportReportService;

  constructor(
    private readonly generateReportService: GenerateReportService,
    exportReportService?: ExportReportService,
  ) {
    this.exportReportService =
      exportReportService ?? new ExportReportService(generateReportService);
  }

  getAvailableTypes = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send(AVAILABLE_REPORT_TYPES);
  };

  queryReport = async (
    request: FastifyRequest<{ Querystring: ReportRequestInput }>,
    reply: FastifyReply,
  ) => {
    return this.executeReport(request.query, reply);
  };

  requestReport = async (
    request: FastifyRequest<{ Body: ReportRequestInput }>,
    reply: FastifyReply,
  ) => {
    return this.executeReport(request.body, reply);
  };

  exportByQuery = async (
    request: FastifyRequest<{ Querystring: ExportReportQueryInput }>,
    reply: FastifyReply,
  ) => {
    const { format, allow_empty, ...reportFilters } = request.query;
    const result = await this.exportReportService.generateAndExport({
      ...reportFilters,
      format,
      allowEmpty: allow_empty,
    });
    return this.sendExportedReport(result, reply);
  };

  exportByBody = async (
    request: FastifyRequest<{ Body: ExportReportBodyInput }>,
    reply: FastifyReply,
  ) => {
    const { report, format, allow_empty, type, ...reportFilters } =
      request.body;
    const result =
      report !== undefined
        ? this.exportReportService.exportFromReport({
            report: report as MeteorologicalReport,
            format,
            allowEmpty: allow_empty,
          })
        : await this.exportReportService.generateAndExport({
            ...reportFilters,
            type: type ?? "",
            format,
            allowEmpty: allow_empty,
          });
    return this.sendExportedReport(result, reply);
  };

  private async executeReport(input: ReportRequestInput, reply: FastifyReply) {
    const report = await this.generateReportService.execute(input);
    return reply.status(200).send(report);
  }

  private sendExportedReport(
    result: ExportedReportResult,
    reply: FastifyReply,
  ) {
    return reply
      .status(200)
      .header("Content-Type", result.contentType)
      .header(
        "Content-Disposition",
        buildExportContentDisposition(result.filename),
      )
      .send(result.content);
  }
}
