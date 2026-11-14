import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import z from "zod";

import { ForbiddenError } from "@/modules/auth/auth.errors.js";
import type { UserPropertiesRepository } from "@/modules/users/repositories/user-properties.repository.js";

export const userPropertiesRoutes: FastifyPluginAsyncZod<{
  repository: UserPropertiesRepository;
}> = async (app, { repository }) => {
  const params = z.object({
    id: z.coerce.number().int().positive().max(2_147_483_647),
  });
  const administrator = async (request: {
    actor: { role_name?: string } | null;
  }) => {
    if (request.actor?.role_name !== "Administrador")
      throw new ForbiddenError();
  };
  app.get(
    "/:id/properties",
    {
      config: { access: { always: true, permission: "users.read" } },
      schema: { params },
      preHandler: administrator,
    },
    async (request) => repository.list(request.params.id),
  );
  app.put(
    "/:id/properties",
    {
      config: { access: { always: true, permission: "users.update" } },
      schema: {
        params,
        body: z.strictObject({
          property_ids: z.array(z.number().int().positive().max(2_147_483_647)),
        }),
      },
      preHandler: administrator,
    },
    async (request) =>
      repository.replace(request.params.id, request.body.property_ids),
  );
};
