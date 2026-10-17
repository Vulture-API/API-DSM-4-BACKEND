import type { PropertyRepository } from "@/modules/properties/repositories/property.repository.js";
import type {
  CreatePropertyInput,
  Property,
} from "@/modules/properties/types/property.type.js";

export class InMemoryPropertyRepository implements PropertyRepository {
  public properties: Property[] = [];
  public users: Array<{ id: number }> = [{ id: 1 }];
  private nextId = 1;

  async create(data: CreatePropertyInput): Promise<Property> {
    const property: Property = {
      id: this.nextId++,
      name: data.name,
      owner_user_id: data.owner_user_id,
      location: data.location ?? null,
      created_at: new Date().toISOString(),
    };

    this.properties.push(property);
    return property;
  }

  async findById(id: number): Promise<Property | null> {
    return this.properties.find((p) => p.id === id) ?? null;
  }

  async userExists(userId: number): Promise<boolean> {
    return this.users.some((u) => u.id === userId);
  }

  async listProperties(): Promise<
    Array<{ id: number; name: string; location: string | null }>
  > {
    return this.properties
      .map(({ id, name, location }) => ({ id, name, location }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
