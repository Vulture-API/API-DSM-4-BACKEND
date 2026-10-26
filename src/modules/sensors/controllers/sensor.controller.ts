import type { FastifyReply, FastifyRequest } from "fastify";

import type { ListSensorsQuery } from "@/modules/sensors/schemas/list-sensors-query.schema.js";
import type { SensorInput } from "@/modules/sensors/schemas/sensor-input.schema.js";
import type { CreateSensorService } from "@/modules/sensors/services/create-sensor.service.js";
import type { DeleteSensorService } from "@/modules/sensors/services/delete-sensor.service.js";
import type { GetSensorService } from "@/modules/sensors/services/get-sensor.service.js";
import type { ListSensorsService } from "@/modules/sensors/services/list-sensors.service.js";
import type { UpdateSensorService } from "@/modules/sensors/services/update-sensor.service.js";
import type { IdPath } from "@/shared/schemas/pagination.schema.js";

export class SensorController {
  constructor(
    private readonly createSensorService: CreateSensorService,
    private readonly listSensorsService: ListSensorsService,
    private readonly getSensorService: GetSensorService,
    private readonly updateSensorService: UpdateSensorService,
    private readonly deleteSensorService: DeleteSensorService,
  ) {}

  create = async (
    request: FastifyRequest<{ Body: SensorInput }>,
    reply: FastifyReply,
  ) => {
    const created = await this.createSensorService.execute(request.body);
    return reply.status(201).send(created);
  };

  list = async (
    request: FastifyRequest<{ Querystring: ListSensorsQuery }>,
    reply: FastifyReply,
  ) => {
    const paginated = await this.listSensorsService.execute(request.query);
    return reply.status(200).send(paginated);
  };

  getById = async (
    request: FastifyRequest<{ Params: IdPath }>,
    reply: FastifyReply,
  ) => {
    const found = await this.getSensorService.execute(request.params.id);
    return reply.status(200).send(found);
  };

  update = async (
    request: FastifyRequest<{ Params: IdPath; Body: SensorInput }>,
    reply: FastifyReply,
  ) => {
    const updated = await this.updateSensorService.execute(
      request.params.id,
      request.body,
    );
    return reply.status(200).send(updated);
  };

  delete = async (
    request: FastifyRequest<{ Params: IdPath }>,
    reply: FastifyReply,
  ) => {
    await this.deleteSensorService.execute(request.params.id);
    return reply.status(204).send();
  };
}
