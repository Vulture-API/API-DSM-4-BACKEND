import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import type { OccurrenceRepository } from "@/modules/occurrences/repositories/occurrence.repository.js";
import {
  listOccurrencesQuerySchema,
  occurrenceIdParamSchema,
} from "@/modules/occurrences/schemas/occurrence.schema.js";
import { OccurrenceQueryService } from "@/modules/occurrences/services/occurrence-query.service.js";

/** GET /api/occurrences, GET /api/occurrences/:id e PATCH .../resolve (SCRUM-425). */
export function buildOccurrenceRoutes(
  repository: OccurrenceRepository,
  clock?: () => Date,
): FastifyPluginAsyncZod {
  return async (app) => {
    const service = new OccurrenceQueryService(repository, clock);

    app.get(
      "/",
      {
        config: { access: { permission: "occurrences.read" } },
        schema: { querystring: listOccurrencesQuerySchema },
      },
      async (request) => service.list(request.query),
    );

    app.get(
      "/:id",
      {
        config: { access: { permission: "occurrences.read" } },
        schema: { params: occurrenceIdParamSchema },
      },
      async (request) => service.get(request.params.id),
    );

    app.patch(
      "/:id/resolve",
      {
        config: { access: { permission: "occurrences.resolve" } },
        schema: { params: occurrenceIdParamSchema },
      },
      async (request) => service.resolve(request.params.id),
    );
  };
}
