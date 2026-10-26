import type { RoleRepositoryPort } from "@/modules/roles/repositories/role.repository.js";
import type { Role } from "@/modules/roles/types/role.type.js";

export class ListRolesService {
  constructor(private readonly roleRepository: RoleRepositoryPort) {}

  async list(): Promise<Role[]> {
    return this.roleRepository.findAll();
  }
}
