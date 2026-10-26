import { RoleNotFoundError } from "@/modules/roles/errors/role.errors.js";
import type { RoleRepositoryPort } from "@/modules/roles/repositories/role.repository.js";
import type { Role } from "@/modules/roles/types/role.type.js";

export class GetRoleService {
  constructor(private readonly roleRepository: RoleRepositoryPort) {}

  async get(id: number): Promise<Role> {
    const role = await this.roleRepository.findById(id);
    if (!role) throw new RoleNotFoundError();
    return role;
  }
}
