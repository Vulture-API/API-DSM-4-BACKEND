import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { ApplicationError } from "@/errors/application.error.js";
import type { MonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import {
  currentQuerySchema,
  liveReadingsQuerySchema,
  overviewQuerySchema,
  seriesQuerySchema,
  stationIdParamSchema,
  stationSeriesQuerySchema,
} from "@/modules/monitoring/schemas/monitoring.schema.js";
import { GetCurrentDataService } from "@/modules/monitoring/services/get-current-data.service.js";
import { GetOverviewService } from "@/modules/monitoring/services/get-overview.service.js";
import { GetReadingSeriesService } from "@/modules/monitoring/services/get-reading-series.service.js";
import type { ReadingsBroadcaster } from "@/modules/monitoring/services/readings-broadcaster.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";

export type LiveLimits = {
  maxConnections: number;
  heartbeatMs: number;
  maxBufferedBytes: number;
};

const DEFAULT_LIVE_LIMITS: LiveLimits = {
  maxConnections: 200,
  heartbeatMs: 30_000,
  maxBufferedBytes: 1024 * 1024,
};

class TooManyConnectionsError extends ApplicationError {
  constructor() {
    super(
      503,
      "TOO_MANY_CONNECTIONS",
      "Live readings connection limit reached.",
    );
  }
}

/**
 * Rotas de monitoramento, no mesmo prefixo /api/stations:
 *   GET /overview              status + última leitura de todas as estações
 *   GET /current               dados meteorológicos atuais (todas ou filtradas)
 *   GET /:id/current           dados meteorológicos atuais de uma estação
 *   GET /current/ws            WebSocket com as leituras novas (?station_id=)
 *   GET /readings/series       série agregada (todas ou por propriedade)
 *   GET /:id/readings/series   série agregada de uma estação
 */
export function buildMonitoringRoutes(
  repository: MonitoringRepository,
  offlineThresholdMinutes: number,
  clock?: () => Date,
  broadcaster?: ReadingsBroadcaster,
  liveLimits?: Partial<LiveLimits>,
): FastifyPluginAsyncZod {
  return async (app) => {
    const overview = new GetOverviewService(
      repository,
      offlineThresholdMinutes,
      clock,
    );
    const series = new GetReadingSeriesService(repository, clock);
    const current = new GetCurrentDataService(
      repository,
      offlineThresholdMinutes,
      clock,
    );

    app.get(
      "/overview",
      { schema: { querystring: overviewQuerySchema } },
      async (request) => overview.execute(request.query),
    );

    app.get(
      "/current",
      { schema: { querystring: currentQuerySchema } },
      async (request) => current.execute(request.query),
    );

    app.get(
      "/:id/current",
      { schema: { params: stationIdParamSchema } },
      async (request) => current.execute({ station_id: request.params.id }),
    );

    if (broadcaster) {
      const limits = { ...DEFAULT_LIVE_LIMITS, ...liveLimits };
      let connections = 0;

      app.get(
        "/current/ws",
        {
          websocket: true,
          schema: { querystring: liveReadingsQuerySchema },
          preHandler: async (request) => {
            if (connections >= limits.maxConnections) {
              throw new TooManyConnectionsError();
            }
            const { station_id } = request.query;
            if (
              station_id !== undefined &&
              !(await repository.stationExists(station_id))
            ) {
              throw new StationNotFoundError();
            }
          },
        },
        (socket, request) => {
          const { station_id } = request.query;
          // O preHandler pode esperar o banco; aberturas simultâneas passam
          // juntas pela primeira checagem.
          if (connections >= limits.maxConnections) {
            socket.close(1013, "TOO_MANY_CONNECTIONS");
            return;
          }
          connections++;

          // Conexão que não responde ao ping some sem disparar "close"
          // até o timeout do TCP; o heartbeat derruba antes.
          let alive = true;
          socket.on("pong", () => {
            alive = true;
          });
          const heartbeat = setInterval(() => {
            if (!alive) {
              socket.terminate();
              return;
            }
            alive = false;
            socket.ping();
          }, limits.heartbeatMs);

          const unsubscribe = broadcaster.subscribe((reading, message) => {
            if (station_id !== undefined && reading.station_id !== station_id)
              return;
            if (socket.readyState !== socket.OPEN) return;
            // Cliente que não consome as mensagens não pode crescer a
            // memória do servidor sem limite.
            if (socket.bufferedAmount > limits.maxBufferedBytes) {
              socket.terminate();
              return;
            }
            socket.send(message);
          });

          socket.on("close", () => {
            connections--;
            clearInterval(heartbeat);
            unsubscribe();
          });
        },
      );
    }

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
