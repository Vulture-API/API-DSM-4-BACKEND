import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import z from "zod";

import type { PermissionRepositoryPort } from "@/modules/permissions/repositories/permission.repository.js";
import {
  permissionInputSchema,
  permissionSchema,
  rolePermissionsSchema,
} from "@/modules/permissions/schemas/permission.schema.js";
import { RoleNotFoundError } from "@/modules/roles/errors/role.errors.js";
import { roleIdSchema } from "@/modules/roles/schemas/role.schema.js";

export const permissionRoutes: FastifyPluginAsyncZod<{
  repository: PermissionRepositoryPort;
}> = async (app, { repository }) => {
  app.get(
    "/permissions",
    {
      config: { access: { always: true, permission: "permissions.read" } },
      schema: { response: { 200: z.array(permissionSchema) } },
    },
    async () => repository.list(),
  );
  app.get(
    "/roles/:id/permissions",
    {
      config: { access: { always: true, permission: "roles.read" } },
      schema: {
        params: roleIdSchema,
        response: { 200: rolePermissionsSchema },
      },
    },
    async (request) => {
      const permissions = await repository.findByRoleId(request.params.id);
      if (permissions === null) throw new RoleNotFoundError();
      return { role_id: request.params.id, permissions };
    },
  );
  app.put(
    "/roles/:id/permissions",
    {
      config: {
        access: { always: true, permission: "roles.permissions.update" },
      },
      schema: {
        params: roleIdSchema,
        body: permissionInputSchema,
        response: { 200: rolePermissionsSchema },
      },
    },
    async (request) => ({
      role_id: request.params.id,
      permissions: await repository.replace(
        request.params.id,
        request.body.permissions,
      ),
    }),
  );
};
