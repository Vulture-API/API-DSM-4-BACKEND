import type { FastifyReply, FastifyRequest } from "fastify";

import type {
  ListStationsQuery,
  StationBodyInput,
  StationIdParam,
} from "@/modules/stations/schemas/station.schema.js";
import type { CreateStationService } from "@/modules/stations/services/create-station.service.js";
import type { DeleteStationService } from "@/modules/stations/services/delete-station.service.js";
import type { GetStationService } from "@/modules/stations/services/get-station.service.js";
import type { GetStationStatusService } from "@/modules/stations/services/get-station-status.service.js";
import type { ListStationsService } from "@/modules/stations/services/list-stations.service.js";
import type { UpdateStationService } from "@/modules/stations/services/update-station.service.js";

export class StationController {
  constructor(
    private readonly createStationService: CreateStationService,
    private readonly listStationsService: ListStationsService,
    private readonly getStationService: GetStationService,
    private readonly getStationStatusService: GetStationStatusService,
    private readonly updateStationService: UpdateStationService,
    private readonly deleteStationService: DeleteStationService,
  ) {}

  create = async (
    request: FastifyRequest<{ Body: StationBodyInput }>,
    reply: FastifyReply,
  ) => {
    const station = await this.createStationService.execute(request.body);

    return reply.status(201).send(station);
  };

  list = async (
    request: FastifyRequest<{ Querystring: ListStationsQuery }>,
    reply: FastifyReply,
  ) => {
    const stations = await this.listStationsService.execute(request.query);

    return reply.status(200).send(stations);
  };

  getById = async (
    request: FastifyRequest<{ Params: StationIdParam }>,
    reply: FastifyReply,
  ) => {
    const station = await this.getStationService.execute(request.params.id);

    return reply.status(200).send(station);
  };

  getStatus = async (
    request: FastifyRequest<{ Params: StationIdParam }>,
    reply: FastifyReply,
  ) => {
    const status = await this.getStationStatusService.execute(
      request.params.id,
    );

    return reply.status(200).send(status);
  };

  update = async (
    request: FastifyRequest<{ Params: StationIdParam; Body: StationBodyInput }>,
    reply: FastifyReply,
  ) => {
    const station = await this.updateStationService.execute(
      request.params.id,
      request.body,
    );

    return reply.status(200).send(station);
  };

  delete = async (
    request: FastifyRequest<{ Params: StationIdParam }>,
    reply: FastifyReply,
  ) => {
    await this.deleteStationService.execute(request.params.id);

    return reply.status(204).send();
  };
}
