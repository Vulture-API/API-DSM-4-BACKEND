import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { PropertyController } from "@/modules/properties/controllers/property.controller.js";
import type { PropertyRepository } from "@/modules/properties/repositories/property.repository.js";
import {
  propertyBodySchema,
  propertyIdParamSchema,
  updatePropertyBodySchema,
} from "@/modules/properties/schemas/property.schema.js";
import { CreatePropertyService } from "@/modules/properties/services/create-property.service.js";
import { ListPropertiesService } from "@/modules/properties/services/list-properties.service.js";
import { UpdatePropertyService } from "@/modules/properties/services/update-property.service.js";

export function buildPropertyRoutes(
  propertyRepository: PropertyRepository,
): FastifyPluginAsyncZod {
  return async (app) => {
    const controller = new PropertyController(
      new CreatePropertyService(propertyRepository),
      new ListPropertiesService(propertyRepository),
      new UpdatePropertyService(propertyRepository),
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
  };
}
