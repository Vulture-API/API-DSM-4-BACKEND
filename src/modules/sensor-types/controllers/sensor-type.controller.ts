import type { FastifyReply, FastifyRequest } from "fastify";

import type { SensorTypeInput } from "@/modules/sensor-types/schemas/sensor-type-input.schema.js";
import type { CreateSensorTypeService } from "@/modules/sensor-types/services/create-sensor-type.service.js";
import type { DeleteSensorTypeService } from "@/modules/sensor-types/services/delete-sensor-type.service.js";
import type { GetSensorTypeService } from "@/modules/sensor-types/services/get-sensor-type.service.js";
import type { ListSensorTypesService } from "@/modules/sensor-types/services/list-sensor-types.service.js";
import type { UpdateSensorTypeService } from "@/modules/sensor-types/services/update-sensor-type.service.js";
import type { IdPath } from "@/shared/schemas/pagination.schema.js";

export class SensorTypeController {
  constructor(
    private readonly createSensorTypeService: CreateSensorTypeService,
    private readonly listSensorTypesService: ListSensorTypesService,
    private readonly getSensorTypeService: GetSensorTypeService,
    private readonly updateSensorTypeService: UpdateSensorTypeService,
    private readonly deleteSensorTypeService: DeleteSensorTypeService,
  ) {}

  create = async (
    request: FastifyRequest<{ Body: SensorTypeInput }>,
    reply: FastifyReply,
  ) => {
    const created = await this.createSensorTypeService.execute(request.body);
    return reply.status(201).send(created);
  };

  list = async (_request: FastifyRequest, reply: FastifyReply) => {
    const list = await this.listSensorTypesService.execute();
    return reply.status(200).send(list);
  };

  getById = async (
    request: FastifyRequest<{ Params: IdPath }>,
    reply: FastifyReply,
  ) => {
    const found = await this.getSensorTypeService.execute(request.params.id);
    return reply.status(200).send(found);
  };

  update = async (
    request: FastifyRequest<{ Params: IdPath; Body: SensorTypeInput }>,
    reply: FastifyReply,
  ) => {
    const updated = await this.updateSensorTypeService.execute(
      request.params.id,
      request.body,
    );
    return reply.status(200).send(updated);
  };

  delete = async (
    request: FastifyRequest<{ Params: IdPath }>,
    reply: FastifyReply,
  ) => {
    await this.deleteSensorTypeService.execute(request.params.id);
    return reply.status(204).send();
  };
}
