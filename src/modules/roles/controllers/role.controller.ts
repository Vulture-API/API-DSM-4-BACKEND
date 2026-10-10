import type { FastifyReply, FastifyRequest } from "fastify";

import type { RoleInput } from "@/modules/roles/schemas/role.schema.js";
import type { CreateRoleService } from "@/modules/roles/services/create-role.service.js";
import type { DeleteRoleService } from "@/modules/roles/services/delete-role.service.js";
import type { GetRoleService } from "@/modules/roles/services/get-role.service.js";
import type { ListRolesService } from "@/modules/roles/services/list-roles.service.js";
import type { UpdateRoleService } from "@/modules/roles/services/update-role.service.js";

export class RoleController {
  constructor(
    private readonly listRolesService: ListRolesService,
    private readonly createRoleService: CreateRoleService,
    private readonly getRoleService: GetRoleService,
    private readonly updateRoleService: UpdateRoleService,
    private readonly deleteRoleService: DeleteRoleService,
  ) {}

  create = async (
    request: FastifyRequest<{ Body: RoleInput }>,
    reply: FastifyReply,
  ) => {
    const role = await this.createRoleService.create(request.body);
    return reply.status(201).send(role);
  };

  get = async (
    request: FastifyRequest<{ Params: { id: number } }>,
    reply: FastifyReply,
  ) => {
    const role = await this.getRoleService.get(request.params.id);
    return reply.status(200).send(role);
  };

  update = async (
    request: FastifyRequest<{ Params: { id: number }; Body: RoleInput }>,
    reply: FastifyReply,
  ) => {
    const role = await this.updateRoleService.update(
      request.params.id,
      request.body,
    );
    return reply.status(200).send(role);
  };

  delete = async (
    request: FastifyRequest<{ Params: { id: number } }>,
    reply: FastifyReply,
  ) => {
    await this.deleteRoleService.delete(request.params.id);
    return reply.status(204).send();
  };

  list = async (_request: FastifyRequest, reply: FastifyReply) => {
    const roles = await this.listRolesService.list();

    return reply.status(200).send(roles);
  };
}
