import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import type { ReadingRepository } from "@/modules/readings/repositories/reading.repository.js";
import {
  createReadingSchema,
  ingestStationDataSchema,
  listReadingsQuerySchema,
} from "@/modules/readings/schemas/reading.schema.js";
import { CreateReadingService } from "@/modules/readings/services/create-reading.service.js";
import { GetReadingsHistoryService } from "@/modules/readings/services/get-readings-history.service.js";
import { ReceiveStationDataService } from "@/modules/readings/services/receive-station-data.service.js";
import type { SensorRepository } from "@/modules/sensors/repositories/sensor.repository.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";
import { stationIdParamSchema } from "@/modules/stations/schemas/station.schema.js";

export function buildReadingRoutes(
  repository: ReadingRepository,
  sensorRepository?: SensorRepository,
  stationRepository?: StationRepository,
  clock?: () => Date,
): FastifyPluginAsyncZod {
  return async (app) => {
    const historyService = new GetReadingsHistoryService(repository);
    const createService = sensorRepository
      ? new CreateReadingService(
          repository,
          sensorRepository,
          stationRepository,
          clock,
        )
      : null;
    const receiveService =
      sensorRepository && stationRepository
        ? new ReceiveStationDataService(
            repository,
            sensorRepository,
            stationRepository,
            clock,
          )
        : null;

    app.get(
      "/",
      {
        config: { access: { permission: "monitoring.read" } },
        schema: {
          querystring: listReadingsQuerySchema,
        },
      },
      async (request) => historyService.execute(request.query),
    );

    app.post(
      "/",
      {
        config: { access: { public: true } },
        schema: {
          body: createReadingSchema,
        },
      },
      async (request, reply) => {
        if (!createService) {
          return reply.status(500).send({
            statusCode: 500,
            error: "Internal Server Error",
            message: "Reading creation service is not configured.",
          });
        }
        const created = await createService.execute(request.body);
        return reply.status(201).send(created);
      },
    );

    app.post(
      "/station-data",
      {
        config: { access: { public: true } },
        schema: {
          body: ingestStationDataSchema,
        },
      },
      async (request, reply) => {
        if (!receiveService) {
          return reply.status(500).send({
            statusCode: 500,
            error: "Internal Server Error",
            message: "Station data reception service is not configured.",
          });
        }
        const created = await receiveService.execute(request.body);
        return reply.status(201).send(created);
      },
    );

    app.post(
      "/stations/:id/data",
      {
        config: { access: { public: true } },
        schema: {
          params: stationIdParamSchema,
          body: ingestStationDataSchema.omit({ station_id: true }),
        },
      },
      async (request, reply) => {
        if (!receiveService) {
          return reply.status(500).send({
            statusCode: 500,
            error: "Internal Server Error",
            message: "Station data reception service is not configured.",
          });
        }
        const created = await receiveService.execute({
          ...request.body,
          station_id: request.params.id,
        });
        return reply.status(201).send(created);
      },
    );
  };
}
