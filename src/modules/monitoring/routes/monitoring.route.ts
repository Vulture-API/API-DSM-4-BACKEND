import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import type { MonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import {
  overviewQuerySchema,
  seriesQuerySchema,
  stationIdParamSchema,
  stationSeriesQuerySchema,
} from "@/modules/monitoring/schemas/monitoring.schema.js";
import { GetOverviewService } from "@/modules/monitoring/services/get-overview.service.js";
import { GetReadingSeriesService } from "@/modules/monitoring/services/get-reading-series.service.js";

/**
 * Rotas de monitoramento, no mesmo prefixo /api/stations:
 *   GET /overview              status + última leitura de todas as estações
 *   GET /readings/series       série agregada (todas ou por propriedade)
 *   GET /:id/readings/series   série agregada de uma estação
 */
export function buildMonitoringRoutes(
  repository: MonitoringRepository,
  offlineThresholdMinutes: number,
  clock?: () => Date,
): FastifyPluginAsyncZod {
  return async (app) => {
    const overview = new GetOverviewService(
      repository,
      offlineThresholdMinutes,
      clock,
    );
    const series = new GetReadingSeriesService(repository, clock);

    app.get(
      "/overview",
      { schema: { querystring: overviewQuerySchema } },
      async (request) => overview.execute(request.query),
    );

    app.get(
      "/readings/series",
      { schema: { querystring: seriesQuerySchema } },
      async (request) => series.execute(request.query),
    );

    app.get(
      "/:id/readings/series",
      {
        schema: {
          params: stationIdParamSchema,
          querystring: stationSeriesQuerySchema,
        },
      },
      async (request) =>
        series.execute({ ...request.query, station_id: request.params.id }),
    );
  };
}
