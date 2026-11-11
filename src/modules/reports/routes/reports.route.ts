import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { ReportController } from "@/modules/reports/controllers/report.controller.js";
import type { ReportRepository } from "@/modules/reports/repositories/report.repository.js";
import { reportRequestSchema } from "@/modules/reports/schemas/report.schema.js";
import { GenerateReportService } from "@/modules/reports/services/generate-report.service.js";

/**
 * Rotas de relatorios meteorologicos, no prefixo /api/reports:
 *   GET  /types   catalogo de tipos disponiveis e filtros aceitos
 *   GET  /        consulta/geracao via query string
 *   POST /        solicitacao de geracao via JSON
 */
export function buildReportRoutes(
  repository: ReportRepository,
  clock?: () => Date,
): FastifyPluginAsyncZod {
  return async (app) => {
    const controller = new ReportController(
      new GenerateReportService(repository, clock),
    );

    app.get(
      "/types",
      {
        config: { access: { permission: "monitoring.read" } },
      },
      controller.getAvailableTypes,
    );

    app.get(
      "/",
      {
        config: { access: { permission: "monitoring.read" } },
        schema: { querystring: reportRequestSchema },
      },
      controller.queryReport,
    );

    app.post(
      "/",
      {
        config: { access: { permission: "monitoring.read" } },
        schema: { body: reportRequestSchema },
      },
      controller.requestReport,
    );
  };
}
