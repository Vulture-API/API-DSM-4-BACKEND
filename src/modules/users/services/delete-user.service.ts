import {
  UserDeletionConflictError,
  UserNotFoundError,
} from "@/modules/users/errors/user.errors.js";
import type { UserRepositoryPort } from "@/modules/users/repositories/user.repository.js";
import { isPostgresError } from "@/modules/users/services/create-user.service.js";

export class DeleteUserService {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async delete(id: number): Promise<void> {
    try {
      if (!(await this.userRepository.delete(id))) {
        throw new UserNotFoundError();
      }
    } catch (error) {
      if (isPostgresError(error, "23503")) {
        throw new UserDeletionConflictError();
      }

      throw error;
    }
  }
}
