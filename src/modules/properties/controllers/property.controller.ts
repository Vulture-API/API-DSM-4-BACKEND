import type { FastifyReply, FastifyRequest } from "fastify";

import type {
  PropertyBodyInput,
  PropertyIdParam,
  UpdatePropertyBodyInput,
} from "@/modules/properties/schemas/property.schema.js";
import type { CreatePropertyService } from "@/modules/properties/services/create-property.service.js";
import type { ListPropertiesService } from "@/modules/properties/services/list-properties.service.js";
import type { UpdatePropertyService } from "@/modules/properties/services/update-property.service.js";

export class PropertyController {
  constructor(
    private readonly createPropertyService: CreatePropertyService,
    private readonly listPropertiesService: ListPropertiesService,
    private readonly updatePropertyService: UpdatePropertyService,
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

  update = async (
    request: FastifyRequest<{
      Params: PropertyIdParam;
      Body: UpdatePropertyBodyInput;
    }>,
    reply: FastifyReply,
  ) => {
    const property = await this.updatePropertyService.execute(
      request.params.id,
      request.body,
    );

    return reply.status(200).send(property);
  };
}
