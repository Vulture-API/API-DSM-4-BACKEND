import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { StationController } from "@/modules/stations/controllers/station.controller.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";
import {
  listStationsQuerySchema,
  stationBodySchema,
  stationIdParamSchema,
} from "@/modules/stations/schemas/station.schema.js";
import { CreateStationService } from "@/modules/stations/services/create-station.service.js";
import { DeleteStationService } from "@/modules/stations/services/delete-station.service.js";
import { GetStationService } from "@/modules/stations/services/get-station.service.js";
import { GetStationStatusService } from "@/modules/stations/services/get-station-status.service.js";
import { ListStationsService } from "@/modules/stations/services/list-stations.service.js";
import { UpdateStationService } from "@/modules/stations/services/update-station.service.js";

export function buildStationRoutes(
  stationRepository: StationRepository,
  offlineThresholdMinutes: number,
  clock?: () => Date,
): FastifyPluginAsyncZod {
  return async (app) => {
    const controller = new StationController(
      new CreateStationService(stationRepository),
      new ListStationsService(stationRepository),
      new GetStationService(stationRepository),
      new GetStationStatusService(
        stationRepository,
        offlineThresholdMinutes,
        clock,
      ),
      new UpdateStationService(stationRepository),
      new DeleteStationService(stationRepository),
    );

    app.post(
      "/",
      {
        config: { access: { permission: "stations.create" } },
        schema: { body: stationBodySchema },
      },
      controller.create,
    );

    app.get(
      "/",
      {
        config: { access: { permission: "stations.read" } },
        schema: { querystring: listStationsQuerySchema },
      },
      controller.list,
    );

    app.get(
      "/properties",
      { config: { access: { permission: "properties.read" } } },
      async (_request, reply) => {
        const properties = (await stationRepository.listProperties?.()) ?? [];
        return reply.status(200).send(properties);
      },
    );

    app.get(
      "/:id/status",
      {
        config: { access: { permission: "stations.read" } },
        schema: { params: stationIdParamSchema },
      },
      controller.getStatus,
    );

    app.get(
      "/:id",
      {
        config: { access: { permission: "stations.read" } },
        schema: { params: stationIdParamSchema },
      },
      controller.getById,
    );

    app.put(
      "/:id",
      {
        config: { access: { permission: "stations.update" } },
        schema: { params: stationIdParamSchema, body: stationBodySchema },
      },
      controller.update,
    );

    app.delete(
      "/:id",
      {
        config: { access: { permission: "stations.delete" } },
        schema: { params: stationIdParamSchema },
      },
      controller.delete,
    );
  };
}
