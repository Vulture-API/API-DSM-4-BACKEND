import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { PropertyController } from "@/modules/properties/controllers/property.controller.js";
import type { PropertyRepository } from "@/modules/properties/repositories/property.repository.js";
import {
  associateStationsBodySchema,
  propertyBodySchema,
  propertyIdParamSchema,
  propertyStationParamsSchema,
  updatePropertyBodySchema,
} from "@/modules/properties/schemas/property.schema.js";
import { AssociatePropertyStationsService } from "@/modules/properties/services/associate-property-stations.service.js";
import { CreatePropertyService } from "@/modules/properties/services/create-property.service.js";
import { ListPropertiesService } from "@/modules/properties/services/list-properties.service.js";
import { ListPropertyStationsService } from "@/modules/properties/services/list-property-stations.service.js";
import { UpdatePropertyService } from "@/modules/properties/services/update-property.service.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";

export function buildPropertyRoutes(
  propertyRepository: PropertyRepository,
  stationRepository?: StationRepository,
): FastifyPluginAsyncZod {
  return async (app) => {
    const resolvedStationRepo =
      stationRepository ?? new InMemoryStationRepository();

    const controller = new PropertyController(
      new CreatePropertyService(propertyRepository),
      new ListPropertiesService(propertyRepository),
      new UpdatePropertyService(propertyRepository),
      new AssociatePropertyStationsService(
        propertyRepository,
        resolvedStationRepo,
      ),
      new ListPropertyStationsService(propertyRepository, resolvedStationRepo),
    );

    app.post(
      "/",
      {
        config: { access: { permission: "properties.create" } },
        schema: { body: propertyBodySchema },
      },
      controller.create,
    );

    app.get(
      "/",
      {
        config: { access: { permission: "properties.read" } },
      },
      controller.list,
    );

    app.put(
      "/:id",
      {
        config: { access: { permission: "properties.update" } },
        schema: {
          params: propertyIdParamSchema,
          body: updatePropertyBodySchema,
        },
      },
      controller.update,
    );

    app.get(
      "/:id/stations",
      {
        config: { access: { permission: "properties.read" } },
        schema: {
          params: propertyIdParamSchema,
        },
      },
      controller.listStations,
    );

    app.post(
      "/:id/stations",
      {
        config: { access: { permission: "properties.update" } },
        schema: {
          params: propertyIdParamSchema,
          body: associateStationsBodySchema,
        },
      },
      controller.associateStations,
    );

    app.put(
      "/:id/stations",
      {
        config: { access: { permission: "properties.update" } },
        schema: {
          params: propertyIdParamSchema,
          body: associateStationsBodySchema,
        },
      },
      controller.associateStations,
    );

    app.put(
      "/:id/stations/:stationId",
      {
        config: { access: { permission: "properties.update" } },
        schema: {
          params: propertyStationParamsSchema,
        },
      },
      controller.associateStations,
    );
  };
}
