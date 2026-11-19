import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { ReportController } from "@/modules/reports/controllers/report.controller.js";
import type { ReportRepository } from "@/modules/reports/repositories/report.repository.js";
import {
  exportReportBodySchema,
  exportReportQuerySchema,
  reportRequestSchema,
} from "@/modules/reports/schemas/report.schema.js";
import { ExportReportService } from "@/modules/reports/services/export-report.service.js";
import { GenerateReportService } from "@/modules/reports/services/generate-report.service.js";

/**
 * Rotas de relatorios meteorologicos, no prefixo /api/reports:
 *   GET  /types   catalogo de tipos disponiveis e filtros aceitos
 *   GET  /        consulta/geracao via query string
 *   POST /        solicitacao de geracao via JSON
 *   GET  /export  geracao e exportacao direta para download (csv/json)
 *   POST /export  exportacao de relatorio gerado ou via filtros (csv/json)
 */
export function buildReportRoutes(
  repository: ReportRepository,
  clock?: () => Date,
): FastifyPluginAsyncZod {
  return async (app) => {
    const generateReportService = new GenerateReportService(repository, clock);
    const exportReportService = new ExportReportService(generateReportService);
    const controller = new ReportController(
      generateReportService,
      exportReportService,
    );

    app.get(
      "/types",
      {
        config: { access: { permission: "monitoring.read" } },
      },
      controller.getAvailableTypes,
    );

    app.get(
      "/export",
      {
        config: { access: { permission: "monitoring.read" } },
        schema: { querystring: exportReportQuerySchema },
      },
      controller.exportByQuery,
    );

    app.post(
      "/export",
      {
        config: { access: { permission: "monitoring.read" } },
        schema: { body: exportReportBodySchema },
      },
      controller.exportByBody,
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
