import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import type { StatisticsRepository } from "@/modules/statistics/repositories/statistics.repository.js";
import {
  stationStatisticsQuerySchema,
  statisticsQuerySchema,
  statisticsStationParamSchema,
} from "@/modules/statistics/schemas/statistics.schema.js";
import { GetStatisticsService } from "@/modules/statistics/services/get-statistics.service.js";

/**
 * Rotas de estatísticas, no prefixo /api/stations:
 *   GET /statistics        todas as estações (ou uma propriedade)
 *   GET /:id/statistics    uma estação
 * Período por from/to (ISO 8601); padrão: últimos 7 dias.
 */
export function buildStatisticsRoutes(
  repository: StatisticsRepository,
  clock?: () => Date,
): FastifyPluginAsyncZod {
  return async (app) => {
    const statistics = new GetStatisticsService(repository, clock);

    app.get(
      "/statistics",
      { schema: { querystring: statisticsQuerySchema } },
      async (request) => statistics.execute(request.query),
    );

    app.get(
      "/:id/statistics",
      {
        schema: {
          params: statisticsStationParamSchema,
          querystring: stationStatisticsQuerySchema,
        },
      },
      async (request) =>
        statistics.execute({ ...request.query, station_id: request.params.id }),
    );
  };
}
