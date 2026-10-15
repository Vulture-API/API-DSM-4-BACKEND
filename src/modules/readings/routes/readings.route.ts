import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import type { ReadingRepository } from "@/modules/readings/repositories/reading.repository.js";
import { listReadingsQuerySchema } from "@/modules/readings/schemas/reading.schema.js";
import { GetReadingsHistoryService } from "@/modules/readings/services/get-readings-history.service.js";

export function buildReadingRoutes(
  repository: ReadingRepository,
): FastifyPluginAsyncZod {
  return async (app) => {
    const service = new GetReadingsHistoryService(repository);

    app.get(
      "/",
      {
        config: { access: { permission: "monitoring.read" } },
        schema: {
          querystring: listReadingsQuerySchema,
        },
      },
      async (request) => service.execute(request.query),
    );
  };
}
