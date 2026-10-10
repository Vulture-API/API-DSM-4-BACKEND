import { RoleNotFoundError } from "@/modules/roles/errors/role.errors.js";
import type { RoleRepositoryPort } from "@/modules/roles/repositories/role.repository.js";
import type { RoleInput } from "@/modules/roles/schemas/role.schema.js";
import type { Role } from "@/modules/roles/types/role.type.js";

export class UpdateRoleService {
  constructor(private readonly roleRepository: RoleRepositoryPort) {}

  async update(id: number, input: RoleInput): Promise<Role> {
    const role = await this.roleRepository.update(id, input);
    if (!role) throw new RoleNotFoundError();
    return role;
  }
}
