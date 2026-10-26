import { UserNotFoundError } from "@/modules/users/errors/user.errors.js";
import type { UserRepositoryPort } from "@/modules/users/repositories/user.repository.js";
import type { UpdateUserAccessInput } from "@/modules/users/schemas/user.schema.js";
import type { User } from "@/modules/users/types/user.type.js";

export class UpdateUserAccessService {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async update(id: number, input: UpdateUserAccessInput): Promise<User> {
    const user = await this.userRepository.updateAccess(id, input.active);
    if (!user) throw new UserNotFoundError();
    return user;
  }
}
