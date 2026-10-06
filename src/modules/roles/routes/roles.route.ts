import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import z from "zod";

import { RoleController } from "@/modules/roles/controllers/role.controller.js";
import type { RoleRepositoryPort } from "@/modules/roles/repositories/role.repository.js";
import { roleSchema } from "@/modules/roles/schemas/role.schema.js";
import { ListRolesService } from "@/modules/roles/services/list-roles.service.js";

export type RoleRoutesOptions = {
  roleRepository: RoleRepositoryPort;
};

export const roleRoutes: FastifyPluginAsyncZod<RoleRoutesOptions> = async (
  app,
  options,
) => {
  const controller = new RoleController(
    new ListRolesService(options.roleRepository),
  );

  app.get(
    "/",
    { schema: { response: { 200: z.array(roleSchema) } } },
    controller.list,
  );
};
