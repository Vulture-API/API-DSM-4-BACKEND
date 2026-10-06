import type { RoleRepositoryPort } from "@/modules/roles/repositories/role.repository.js";
import type { Role } from "@/modules/roles/types/role.type.js";

export class FakeRoleRepository implements RoleRepositoryPort {
  roles: Role[] = [
    {
      id: 1,
      name: "Administrator",
      description: "System administrator",
      created_at: "2026-09-18T12:00:00.000Z",
    },
    {
      id: 2,
      name: "Manager",
      description: null,
      created_at: "2026-09-18T12:00:00.000Z",
    },
    {
      id: 3,
      name: "Operator",
      description: null,
      created_at: "2026-09-18T12:00:00.000Z",
    },
  ];

  async findAll(): Promise<Role[]> {
    return [...this.roles];
  }

  async exists(id: number): Promise<boolean> {
    return this.roles.some((role) => role.id === id);
  }
}
