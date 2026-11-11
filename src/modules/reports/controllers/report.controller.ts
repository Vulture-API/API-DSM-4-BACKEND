import type { FastifyReply, FastifyRequest } from "fastify";

import type { ReportRequestInput } from "@/modules/reports/schemas/report.schema.js";
import {
  DEFAULT_FORECAST_DAYS,
  DEFAULT_REPORT_PERIOD_DAYS,
  type GenerateReportService,
  MAX_FORECAST_DAYS,
  MAX_REPORT_PERIOD_DAYS,
} from "@/modules/reports/services/generate-report.service.js";

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
  constructor(private readonly generateReportService: GenerateReportService) {}

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

  private async executeReport(input: ReportRequestInput, reply: FastifyReply) {
    const report = await this.generateReportService.execute(input);
    return reply.status(200).send(report);
  }
}
