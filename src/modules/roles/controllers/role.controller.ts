import type { FastifyReply, FastifyRequest } from "fastify";

import type { ListRolesService } from "@/modules/roles/services/list-roles.service.js";

export class RoleController {
  constructor(private readonly listRolesService: ListRolesService) {}

  list = async (_request: FastifyRequest, reply: FastifyReply) => {
    const roles = await this.listRolesService.list();

    return reply.status(200).send(roles);
  };
}
