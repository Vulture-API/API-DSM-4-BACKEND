import {
  RoleDeletionConflictError,
  RoleNameConflictError,
} from "@/modules/roles/errors/role.errors.js";
import type { RoleRepositoryPort } from "@/modules/roles/repositories/role.repository.js";
import type { RoleInput } from "@/modules/roles/schemas/role.schema.js";
import type { Role } from "@/modules/roles/types/role.type.js";

export class FakeRoleRepository implements RoleRepositoryPort {
  referencedRoleIds = new Set<number>();
  private nextId = 4;
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

  async create(input: RoleInput): Promise<Role> {
    this.checkName(input.name);
    const role = {
      ...input,
      id: this.nextId++,
      created_at: "2026-09-18T12:00:00.000Z",
    };
    this.roles.push(role);
    return { ...role };
  }

  async findById(id: number): Promise<Role | null> {
    const role = this.roles.find((role) => role.id === id);
    return role ? { ...role } : null;
  }

  async update(id: number, input: RoleInput): Promise<Role | null> {
    const index = this.roles.findIndex((role) => role.id === id);
    if (index === -1) return null;
    this.checkName(input.name, id);
    const role = { ...this.roles[index]!, ...input };
    this.roles[index] = role;
    return { ...role };
  }

  async delete(id: number): Promise<boolean> {
    const index = this.roles.findIndex((role) => role.id === id);
    if (index === -1) return false;
    if (this.referencedRoleIds.has(id)) throw new RoleDeletionConflictError();
    this.roles.splice(index, 1);
    return true;
  }

  async findAll(): Promise<Role[]> {
    return [...this.roles];
  }

  async exists(id: number): Promise<boolean> {
    return this.roles.some((role) => role.id === id);
  }

  private checkName(name: string, id?: number): void {
    if (this.roles.some((role) => role.name === name && role.id !== id)) {
      throw new RoleNameConflictError();
    }
  }
}
