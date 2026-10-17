import type { FastifyReply, FastifyRequest } from "fastify";

import type { PropertyBodyInput } from "@/modules/properties/schemas/property.schema.js";
import type { CreatePropertyService } from "@/modules/properties/services/create-property.service.js";
import type { ListPropertiesService } from "@/modules/properties/services/list-properties.service.js";

export class PropertyController {
  constructor(
    private readonly createPropertyService: CreatePropertyService,
    private readonly listPropertiesService: ListPropertiesService,
  ) {}

  create = async (
    request: FastifyRequest<{ Body: PropertyBodyInput }>,
    reply: FastifyReply,
  ) => {
    const property = await this.createPropertyService.execute(request.body);

    return reply.status(201).send(property);
  };

  list = async (_request: FastifyRequest, reply: FastifyReply) => {
    const properties = await this.listPropertiesService.execute();

    return reply.status(200).send(properties);
  };
}
