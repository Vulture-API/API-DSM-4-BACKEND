import type { RoleRepositoryPort } from "@/modules/roles/repositories/role.repository.js";
import {
  EmailAlreadyExistsError,
  RoleNotFoundError,
} from "@/modules/users/errors/user.errors.js";
import type { UserRepositoryPort } from "@/modules/users/repositories/user.repository.js";
import type { CreateUserInput } from "@/modules/users/schemas/user.schema.js";
import {
  hashPassword,
  type PasswordHasher,
} from "@/modules/users/services/password-hasher.js";
import type { User } from "@/modules/users/types/user.type.js";

export class CreateUserService {
  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly roleRepository: RoleRepositoryPort,
    private readonly passwordHasher: PasswordHasher = hashPassword,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    if (!(await this.roleRepository.exists(input.role_id))) {
      throw new RoleNotFoundError();
    }

    const passwordHash = await this.passwordHasher(input.password);

    try {
      return await this.userRepository.create({
        roleId: input.role_id,
        name: input.name,
        email: input.email,
        passwordHash,
        active: input.active,
      });
    } catch (error) {
      if (isPostgresError(error, "23505")) {
        throw new EmailAlreadyExistsError();
      }

      if (isPostgresError(error, "23503")) {
        throw new RoleNotFoundError();
      }

      throw error;
    }
  }
}

export function isPostgresError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
