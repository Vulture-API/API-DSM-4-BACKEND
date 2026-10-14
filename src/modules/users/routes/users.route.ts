import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import type { RoleRepositoryPort } from "@/modules/roles/repositories/role.repository.js";
import { UserController } from "@/modules/users/controllers/user.controller.js";
import type { UserRepositoryPort } from "@/modules/users/repositories/user.repository.js";
import {
  createUserSchema,
  paginatedUsersSchema,
  paginationSchema,
  updateUserAccessSchema,
  updateUserSchema,
  userAccessIdSchema,
  userIdSchema,
  userSchema,
} from "@/modules/users/schemas/user.schema.js";
import { CreateUserService } from "@/modules/users/services/create-user.service.js";
import { DeleteUserService } from "@/modules/users/services/delete-user.service.js";
import { GetUserService } from "@/modules/users/services/get-user.service.js";
import { ListUsersService } from "@/modules/users/services/list-users.service.js";
import type { PasswordHasher } from "@/modules/users/services/password-hasher.js";
import { UpdateUserService } from "@/modules/users/services/update-user.service.js";
import { UpdateUserAccessService } from "@/modules/users/services/update-user-access.service.js";

export type UserRoutesOptions = {
  userRepository: UserRepositoryPort;
  roleRepository: RoleRepositoryPort;
  passwordHasher?: PasswordHasher;
};

export const userRoutes: FastifyPluginAsyncZod<UserRoutesOptions> = async (
  app,
  options,
) => {
  const createUserService = new CreateUserService(
    options.userRepository,
    options.roleRepository,
    options.passwordHasher,
  );
  const userController = new UserController(
    createUserService,
    new ListUsersService(options.userRepository),
    new GetUserService(options.userRepository),
    new UpdateUserService(options.userRepository, options.roleRepository),
    new DeleteUserService(options.userRepository),
    new UpdateUserAccessService(options.userRepository),
  );

  app.post(
    "/",
    {
      config: { access: { permission: "users.create" } },
      schema: {
        body: createUserSchema,
        response: { 201: userSchema },
      },
    },
    userController.create,
  );

  app.get(
    "/",
    {
      config: { access: { permission: "users.read" } },
      schema: {
        querystring: paginationSchema,
        response: { 200: paginatedUsersSchema },
      },
    },
    userController.list,
  );

  app.get(
    "/:id",
    {
      config: { access: { permission: "users.read" } },
      schema: {
        params: userIdSchema,
        response: { 200: userSchema },
      },
    },
    userController.get,
  );

  app.put(
    "/:id",
    {
      config: { access: { permission: "users.update" } },
      schema: {
        params: userIdSchema,
        body: updateUserSchema,
        response: { 200: userSchema },
      },
    },
    userController.update,
  );

  app.delete(
    "/:id",
    {
      config: { access: { permission: "users.delete" } },
      schema: { params: userIdSchema },
    },
    userController.delete,
  );

  app.patch(
    "/:id/access",
    {
      config: { access: { always: true, permission: "users.update" } },
      schema: {
        params: userAccessIdSchema,
        body: updateUserAccessSchema,
        response: { 200: userSchema },
      },
    },
    userController.updateAccess,
  );
};
