import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { SensorTypeController } from "@/modules/sensor-types/controllers/sensor-type.controller.js";
import { SensorTypeRepository } from "@/modules/sensor-types/repositories/sensor-type.repository.js";
import { sensorTypeInputSchema } from "@/modules/sensor-types/schemas/sensor-type-input.schema.js";
import { CreateSensorTypeService } from "@/modules/sensor-types/services/create-sensor-type.service.js";
import { DeleteSensorTypeService } from "@/modules/sensor-types/services/delete-sensor-type.service.js";
import { GetSensorTypeService } from "@/modules/sensor-types/services/get-sensor-type.service.js";
import { ListSensorTypesService } from "@/modules/sensor-types/services/list-sensor-types.service.js";
import { UpdateSensorTypeService } from "@/modules/sensor-types/services/update-sensor-type.service.js";
import { idPathSchema } from "@/shared/schemas/pagination.schema.js";

export interface SensorTypeRouteOptions {
  repository?: SensorTypeRepository;
}

export const sensorTypeRoutes: FastifyPluginAsyncZod<
  SensorTypeRouteOptions
> = async (app, opts) => {
  const sensorTypeRepository = opts.repository ?? new SensorTypeRepository();
  const createSensorTypeService = new CreateSensorTypeService(
    sensorTypeRepository,
  );
  const listSensorTypesService = new ListSensorTypesService(
    sensorTypeRepository,
  );
  const getSensorTypeService = new GetSensorTypeService(sensorTypeRepository);
  const updateSensorTypeService = new UpdateSensorTypeService(
    sensorTypeRepository,
  );
  const deleteSensorTypeService = new DeleteSensorTypeService(
    sensorTypeRepository,
  );

  const controller = new SensorTypeController(
    createSensorTypeService,
    listSensorTypesService,
    getSensorTypeService,
    updateSensorTypeService,
    deleteSensorTypeService,
  );

  app.post(
    "/",
    {
      schema: {
        body: sensorTypeInputSchema,
      },
    },
    controller.create,
  );

  app.get("/", controller.list);

  app.get(
    "/:id",
    {
      schema: {
        params: idPathSchema,
      },
    },
    controller.getById,
  );

  app.put(
    "/:id",
    {
      schema: {
        params: idPathSchema,
        body: sensorTypeInputSchema,
      },
    },
    controller.update,
  );

  app.delete(
    "/:id",
    {
      schema: {
        params: idPathSchema,
      },
    },
    controller.delete,
  );
};
