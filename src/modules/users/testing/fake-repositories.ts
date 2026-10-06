import type {
  CreateUserRecord,
  UpdateUserRecord,
  UserRepositoryPort,
} from "@/modules/users/repositories/user.repository.js";
import type { PaginatedUsers, User } from "@/modules/users/types/user.type.js";

export class FakeUserRepository implements UserRepositoryPort {
  users: User[] = [];
  passwordHashes: string[] = [];
  deleteError: unknown;
  private nextId = 1;

  async create(input: CreateUserRecord): Promise<User> {
    if (this.users.some((user) => user.email === input.email)) {
      throw { code: "23505" };
    }

    const user: User = {
      id: this.nextId++,
      role_id: input.roleId,
      name: input.name,
      email: input.email,
      active: input.active,
      created_at: "2026-09-18T12:00:00.000Z",
    };
    this.users.push(user);
    this.passwordHashes.push(input.passwordHash);

    return user;
  }

  async findAll(page: number, limit: number): Promise<PaginatedUsers> {
    const start = (page - 1) * limit;

    return {
      data: this.users.slice(start, start + limit),
      meta: {
        total_records: this.users.length,
        total_pages: Math.ceil(this.users.length / limit),
        current_page: page,
      },
    };
  }

  async findById(id: number): Promise<User | null> {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async update(id: number, input: UpdateUserRecord): Promise<User | null> {
    const index = this.users.findIndex((user) => user.id === id);

    if (index === -1) {
      return null;
    }

    const current = this.users[index]!;
    const updated: User = {
      ...current,
      role_id: input.roleId,
      name: input.name,
      active: input.active,
    };
    this.users[index] = updated;

    return updated;
  }

  async delete(id: number): Promise<boolean> {
    if (this.deleteError) {
      throw this.deleteError;
    }

    const index = this.users.findIndex((user) => user.id === id);

    if (index === -1) {
      return false;
    }

    this.users.splice(index, 1);
    return true;
  }
}
