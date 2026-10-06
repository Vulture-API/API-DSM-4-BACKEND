import type { FastifyReply, FastifyRequest } from "fastify";

import type {
  CreateUserInput,
  PaginationInput,
  UpdateUserInput,
} from "@/modules/users/schemas/user.schema.js";
import type { CreateUserService } from "@/modules/users/services/create-user.service.js";
import type { DeleteUserService } from "@/modules/users/services/delete-user.service.js";
import type { GetUserService } from "@/modules/users/services/get-user.service.js";
import type { ListUsersService } from "@/modules/users/services/list-users.service.js";
import type { UpdateUserService } from "@/modules/users/services/update-user.service.js";

export class UserController {
  constructor(
    private readonly createUserService: CreateUserService,
    private readonly listUsersService: ListUsersService,
    private readonly getUserService: GetUserService,
    private readonly updateUserService: UpdateUserService,
    private readonly deleteUserService: DeleteUserService,
  ) {}

  create = async (
    request: FastifyRequest<{ Body: CreateUserInput }>,
    reply: FastifyReply,
  ) => {
    const user = await this.createUserService.create(request.body);

    return reply.status(201).send(user);
  };

  list = async (
    request: FastifyRequest<{ Querystring: PaginationInput }>,
    reply: FastifyReply,
  ) => {
    const users = await this.listUsersService.list(request.query);

    return reply.status(200).send(users);
  };

  get = async (
    request: FastifyRequest<{ Params: { id: number } }>,
    reply: FastifyReply,
  ) => {
    const user = await this.getUserService.get(request.params.id);

    return reply.status(200).send(user);
  };

  update = async (
    request: FastifyRequest<{
      Params: { id: number };
      Body: UpdateUserInput;
    }>,
    reply: FastifyReply,
  ) => {
    const user = await this.updateUserService.update(
      request.params.id,
      request.body,
    );

    return reply.status(200).send(user);
  };

  delete = async (
    request: FastifyRequest<{ Params: { id: number } }>,
    reply: FastifyReply,
  ) => {
    await this.deleteUserService.delete(request.params.id);

    return reply.status(204).send();
  };
}
