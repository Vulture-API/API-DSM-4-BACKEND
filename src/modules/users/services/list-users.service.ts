import type { UserRepositoryPort } from "@/modules/users/repositories/user.repository.js";
import type { PaginationInput } from "@/modules/users/schemas/user.schema.js";
import type { PaginatedUsers } from "@/modules/users/types/user.type.js";

export class ListUsersService {
  constructor(private readonly userRepository: UserRepositoryPort) {}

  async list(input: PaginationInput): Promise<PaginatedUsers> {
    return this.userRepository.findAll(input.page, input.limit);
  }
}
