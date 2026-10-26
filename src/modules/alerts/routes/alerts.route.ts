import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import z from "zod";

import { AlertController } from "@/modules/alerts/controllers/alert.controller.js";
import type {
  AlertConfigRepository,
  TriggeredAlertRepository,
} from "@/modules/alerts/repositories/alert.repository.js";
import {
  acknowledgeBodySchema,
  alertConfigBodySchema,
  idParamSchema,
  listAlertConfigsQuerySchema,
  listTriggeredAlertsQuerySchema,
} from "@/modules/alerts/schemas/alert.schema.js";
import { AcknowledgeAlertService } from "@/modules/alerts/services/acknowledge-alert.service.js";
import { CreateAlertConfigService } from "@/modules/alerts/services/create-alert-config.service.js";
import { DeleteAlertConfigService } from "@/modules/alerts/services/delete-alert-config.service.js";
import { GetAlertConfigService } from "@/modules/alerts/services/get-alert-config.service.js";
import { ListAlertConfigsService } from "@/modules/alerts/services/list-alert-configs.service.js";
import { ListTriggeredAlertsService } from "@/modules/alerts/services/list-triggered-alerts.service.js";
import { UpdateAlertConfigService } from "@/modules/alerts/services/update-alert-config.service.js";

export function buildAlertRoutes(
  alertConfigRepository: AlertConfigRepository,
  triggeredAlertRepository: TriggeredAlertRepository,
  accessControlEnabled = false,
): FastifyPluginAsyncZod {
  return async (app) => {
    const controller = new AlertController(
      new CreateAlertConfigService(alertConfigRepository),
      new ListAlertConfigsService(alertConfigRepository),
      new GetAlertConfigService(alertConfigRepository),
      new UpdateAlertConfigService(alertConfigRepository),
      new DeleteAlertConfigService(alertConfigRepository),
      new ListTriggeredAlertsService(triggeredAlertRepository),
      new AcknowledgeAlertService(triggeredAlertRepository),
    );

    app.post(
      "/config",
      {
        config: { access: { permission: "alert-configs.create" } },
        schema: { body: alertConfigBodySchema },
      },
      controller.createConfig,
    );

    app.get(
      "/config",
      {
        config: { access: { permission: "alert-configs.read" } },
        schema: { querystring: listAlertConfigsQuerySchema },
      },
      controller.listConfigs,
    );

    app.get(
      "/config/:id",
      {
        config: { access: { permission: "alert-configs.read" } },
        schema: { params: idParamSchema },
      },
      controller.getConfig,
    );

    app.put(
      "/config/:id",
      {
        config: { access: { permission: "alert-configs.update" } },
        schema: { params: idParamSchema, body: alertConfigBodySchema },
      },
      controller.updateConfig,
    );

    app.delete(
      "/config/:id",
      {
        config: { access: { permission: "alert-configs.delete" } },
        schema: { params: idParamSchema },
      },
      controller.deleteConfig,
    );

    app.get(
      "/triggered",
      {
        config: { access: { permission: "triggered-alerts.read" } },
        schema: { querystring: listTriggeredAlertsQuerySchema },
      },
      controller.listTriggered,
    );

    app.put(
      "/triggered/:id/acknowledge",
      {
        config: { access: { permission: "triggered-alerts.acknowledge" } },
        schema: {
          params: idParamSchema,
          body: accessControlEnabled
            ? z.object({}).default({})
            : acknowledgeBodySchema,
        },
      },
      controller.acknowledge,
    );
  };
}
