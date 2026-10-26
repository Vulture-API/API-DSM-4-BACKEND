import { PERMISSIONS } from "@/modules/permissions/permission-catalog.js";
import type {
  Permission,
  PermissionRepositoryPort,
} from "@/modules/permissions/repositories/permission.repository.js";
import { RoleNotFoundError } from "@/modules/roles/errors/role.errors.js";
import type { RoleRepositoryPort } from "@/modules/roles/repositories/role.repository.js";

export class FakePermissionRepository implements PermissionRepositoryPort {
  grants = new Map<number, string[]>();
  constructor(private readonly roles: RoleRepositoryPort) {}
  async list(): Promise<Permission[]> {
    return [...PERMISSIONS];
  }
  async findByRoleId(id: number): Promise<string[] | null> {
    return (await this.roles.exists(id))
      ? [...(this.grants.get(id) ?? [])].sort()
      : null;
  }
  async findByRoleIds(ids: number[]): Promise<Map<number, string[]>> {
    return new Map(
      ids.map((id) => [id, [...(this.grants.get(id) ?? [])].sort()]),
    );
  }
  async replace(id: number, permissions: string[]): Promise<string[]> {
    if (!(await this.roles.exists(id))) throw new RoleNotFoundError();
    const sorted = [...permissions].sort();
    this.grants.set(id, sorted);
    return sorted;
  }
}
