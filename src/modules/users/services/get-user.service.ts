import { UserNotFoundError } from "@/modules/users/errors/user.errors.js";
import type { UserRepositoryPort } from "@/modules/users/repositories/user.repository.js";
import type { User } from "@/modules/users/types/user.type.js";

export class GetUserService {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async get(id: number): Promise<User> {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new UserNotFoundError();
    }

    return user;
  }
}
