import type { RoleRepositoryPort } from "@/modules/roles/repositories/role.repository.js";
import type { RoleInput } from "@/modules/roles/schemas/role.schema.js";
import type { Role } from "@/modules/roles/types/role.type.js";

export class CreateRoleService {
  constructor(private readonly roleRepository: RoleRepositoryPort) {}

  async create(input: RoleInput): Promise<Role> {
    return this.roleRepository.create(input);
  }
}
