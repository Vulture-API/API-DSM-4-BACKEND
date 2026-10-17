import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { PropertyController } from "@/modules/properties/controllers/property.controller.js";
import type { PropertyRepository } from "@/modules/properties/repositories/property.repository.js";
import { propertyBodySchema } from "@/modules/properties/schemas/property.schema.js";
import { CreatePropertyService } from "@/modules/properties/services/create-property.service.js";
import { ListPropertiesService } from "@/modules/properties/services/list-properties.service.js";

export function buildPropertyRoutes(
  propertyRepository: PropertyRepository,
): FastifyPluginAsyncZod {
  return async (app) => {
    const controller = new PropertyController(
      new CreatePropertyService(propertyRepository),
      new ListPropertiesService(propertyRepository),
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
  };
}
