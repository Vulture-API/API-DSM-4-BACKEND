import { RoleNotFoundError } from "@/modules/roles/errors/role.errors.js";
import type { RoleRepositoryPort } from "@/modules/roles/repositories/role.repository.js";

export class DeleteRoleService {
  constructor(private readonly roleRepository: RoleRepositoryPort) {}

  async delete(id: number): Promise<void> {
    if (!(await this.roleRepository.delete(id))) throw new RoleNotFoundError();
  }
}
