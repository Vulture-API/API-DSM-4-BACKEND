import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { SensorController } from "@/modules/sensors/controllers/sensor.controller.js";
import {
  InMemorySensorRepository,
  type SensorRepository,
} from "@/modules/sensors/repositories/sensor.repository.js";
import { listSensorsQuerySchema } from "@/modules/sensors/schemas/list-sensors-query.schema.js";
import { sensorInputSchema } from "@/modules/sensors/schemas/sensor-input.schema.js";
import { CreateSensorService } from "@/modules/sensors/services/create-sensor.service.js";
import { DeleteSensorService } from "@/modules/sensors/services/delete-sensor.service.js";
import { GetSensorService } from "@/modules/sensors/services/get-sensor.service.js";
import { ListSensorsService } from "@/modules/sensors/services/list-sensors.service.js";
import { UpdateSensorService } from "@/modules/sensors/services/update-sensor.service.js";
import { idPathSchema } from "@/shared/schemas/pagination.schema.js";

export interface SensorRouteOptions {
  repository?: SensorRepository;
}

export const sensorRoutes: FastifyPluginAsyncZod<SensorRouteOptions> = async (
  app,
  opts,
) => {
  const sensorRepository = opts.repository ?? new InMemorySensorRepository();
  const createSensorService = new CreateSensorService(sensorRepository);
  const listSensorsService = new ListSensorsService(sensorRepository);
  const getSensorService = new GetSensorService(sensorRepository);
  const updateSensorService = new UpdateSensorService(sensorRepository);
  const deleteSensorService = new DeleteSensorService(sensorRepository);

  const controller = new SensorController(
    createSensorService,
    listSensorsService,
    getSensorService,
    updateSensorService,
    deleteSensorService,
  );

  app.post(
    "/",
    {
      config: { access: { permission: "sensors.create" } },
      schema: {
        body: sensorInputSchema,
      },
    },
    controller.create,
  );

  app.get(
    "/",
    {
      config: { access: { permission: "sensors.read" } },
      schema: {
        querystring: listSensorsQuerySchema,
      },
    },
    controller.list,
  );

  app.get(
    "/:id",
    {
      config: { access: { permission: "sensors.read" } },
      schema: {
        params: idPathSchema,
      },
    },
    controller.getById,
  );

  app.put(
    "/:id",
    {
      config: { access: { permission: "sensors.update" } },
      schema: {
        params: idPathSchema,
        body: sensorInputSchema,
      },
    },
    controller.update,
  );

  app.delete(
    "/:id",
    {
      config: { access: { permission: "sensors.delete" } },
      schema: {
        params: idPathSchema,
      },
    },
    controller.delete,
  );
};
