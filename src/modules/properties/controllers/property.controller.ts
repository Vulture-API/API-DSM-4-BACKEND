import type { FastifyReply, FastifyRequest } from "fastify";

import type {
  AssociateStationsBodyInput,
  PropertyBodyInput,
  PropertyIdParam,
  PropertyStationParams,
  UpdatePropertyBodyInput,
} from "@/modules/properties/schemas/property.schema.js";
import type { AssociatePropertyStationsService } from "@/modules/properties/services/associate-property-stations.service.js";
import type { CreatePropertyService } from "@/modules/properties/services/create-property.service.js";
import type { DeletePropertyService } from "@/modules/properties/services/delete-property.service.js";
import type { ListPropertiesService } from "@/modules/properties/services/list-properties.service.js";
import type { ListPropertyStationsService } from "@/modules/properties/services/list-property-stations.service.js";
import type { UpdatePropertyService } from "@/modules/properties/services/update-property.service.js";

export class PropertyController {
  constructor(
    private readonly createPropertyService: CreatePropertyService,
    private readonly listPropertiesService: ListPropertiesService,
    private readonly updatePropertyService: UpdatePropertyService,
    private readonly deletePropertyService?: DeletePropertyService,
    private readonly associatePropertyStationsService?: AssociatePropertyStationsService,
    private readonly listPropertyStationsService?: ListPropertyStationsService,
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

  delete = async (
    request: FastifyRequest<{
      Params: PropertyIdParam;
    }>,
    reply: FastifyReply,
  ) => {
    if (!this.deletePropertyService) {
      return reply.status(501).send();
    }

    await this.deletePropertyService.execute(request.params.id);

    return reply.status(204).send();
  };

  associateStations = async (
    request: FastifyRequest<{
      Params: PropertyStationParams;
      Body?: AssociateStationsBodyInput;
    }>,
    reply: FastifyReply,
  ) => {
    if (!this.associatePropertyStationsService) {
      return reply.status(501).send();
    }

    const propertyId = request.params.id;
    let stationIds: number[] = [];

    if (request.params.stationId !== undefined) {
      stationIds = [request.params.stationId];
    } else if (request.body) {
      if (request.body.station_ids && request.body.station_ids.length > 0) {
        stationIds = request.body.station_ids;
      } else if (request.body.station_id !== undefined) {
        stationIds = [request.body.station_id];
      }
    }

    const stations = await this.associatePropertyStationsService.execute(
      propertyId,
      stationIds,
    );

    return reply.status(200).send(stations);
  };

  listStations = async (
    request: FastifyRequest<{
      Params: PropertyIdParam;
    }>,
    reply: FastifyReply,
  ) => {
    if (!this.listPropertyStationsService) {
      return reply.status(501).send();
    }

    const stations = await this.listPropertyStationsService.execute(
      request.params.id,
    );

    return reply.status(200).send(stations);
  };
}
