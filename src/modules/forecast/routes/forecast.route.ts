import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import type { ForecastProvider } from "@/modules/forecast/providers/forecast.provider.js";
import {
  forecastParamSchema,
  forecastQuerySchema,
} from "@/modules/forecast/schemas/forecast.schema.js";
import {
  type ForecastErrorContext,
  GetForecastService,
} from "@/modules/forecast/services/get-forecast.service.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";

/** GET /api/stations/:id/forecast?days=1..7 */
export function buildForecastRoutes(
  stations: StationRepository,
  provider: ForecastProvider,
  clock?: () => Date,
  onProviderError?: (error: unknown, context: ForecastErrorContext) => void,
): FastifyPluginAsyncZod {
  return async (app) => {
    const forecast = new GetForecastService(
      stations,
      provider,
      clock,
      onProviderError,
    );

    app.get(
      "/:id/forecast",
      {
        schema: {
          params: forecastParamSchema,
          querystring: forecastQuerySchema,
        },
      },
      async (request) =>
        forecast.execute({
          station_id: request.params.id,
          days: request.query.days,
        }),
    );
  };
}
