import type { RoleRepositoryPort } from "@/modules/roles/repositories/role.repository.js";
import {
  RoleNotFoundError,
  UserNotFoundError,
} from "@/modules/users/errors/user.errors.js";
import type { UserRepositoryPort } from "@/modules/users/repositories/user.repository.js";
import type { UpdateUserInput } from "@/modules/users/schemas/user.schema.js";
import { isPostgresError } from "@/modules/users/services/create-user.service.js";
import type { User } from "@/modules/users/types/user.type.js";

export class UpdateUserService {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
  ) {}

  async update(id: number, input: UpdateUserInput): Promise<User> {
    if (!(await this.roleRepository.exists(input.role_id))) {
      throw new RoleNotFoundError();
    }

    try {
      const user = await this.userRepository.update(id, {
        roleId: input.role_id,
        name: input.name,
        active: input.active,
      });

      if (!user) {
        throw new UserNotFoundError();
      }

      return user;
    } catch (error) {
      if (isPostgresError(error, "23503")) {
        throw new RoleNotFoundError();
      }

      throw error;
    }
  }
}
