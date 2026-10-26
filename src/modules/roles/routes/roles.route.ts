import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import z from "zod";

import type { PermissionRepositoryPort } from "@/modules/permissions/repositories/permission.repository.js";
import { RoleController } from "@/modules/roles/controllers/role.controller.js";
import type { RoleRepositoryPort } from "@/modules/roles/repositories/role.repository.js";
import {
  roleIdSchema,
  roleInputSchema,
  roleSchema,
} from "@/modules/roles/schemas/role.schema.js";
import { CreateRoleService } from "@/modules/roles/services/create-role.service.js";
import { DeleteRoleService } from "@/modules/roles/services/delete-role.service.js";
import { GetRoleService } from "@/modules/roles/services/get-role.service.js";
import { ListRolesService } from "@/modules/roles/services/list-roles.service.js";
import { UpdateRoleService } from "@/modules/roles/services/update-role.service.js";

export type RoleRoutesOptions = {
  roleRepository: RoleRepositoryPort;
  permissionRepository: PermissionRepositoryPort;
};

export const roleRoutes: FastifyPluginAsyncZod<RoleRoutesOptions> = async (
  app,
  options,
) => {
  const controller = new RoleController(
    new ListRolesService(options.roleRepository),
    new CreateRoleService(options.roleRepository),
    new GetRoleService(options.roleRepository),
    new UpdateRoleService(options.roleRepository),
    new DeleteRoleService(options.roleRepository),
    options.permissionRepository,
  );

  app.get(
    "/",
    {
      config: { access: { permission: "roles.read" } },
      schema: { response: { 200: z.array(roleSchema) } },
    },
    controller.list,
  );

  app.post(
    "/",
    {
      config: { access: { permission: "roles.create" } },
      schema: { body: roleInputSchema, response: { 201: roleSchema } },
    },
    controller.create,
  );
  app.get(
    "/:id",
    {
      config: { access: { permission: "roles.read" } },
      schema: { params: roleIdSchema, response: { 200: roleSchema } },
    },
    controller.get,
  );
  app.put(
    "/:id",
    {
      config: { access: { permission: "roles.update" } },
      schema: {
        params: roleIdSchema,
        body: roleInputSchema,
        response: { 200: roleSchema },
      },
    },
    controller.update,
  );
  app.delete(
    "/:id",
    {
      config: { access: { permission: "roles.delete" } },
      schema: { params: roleIdSchema },
    },
    controller.delete,
  );
};
