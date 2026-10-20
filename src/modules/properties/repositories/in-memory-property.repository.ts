import type { PropertyRepository } from "@/modules/properties/repositories/property.repository.js";
import type {
  CreatePropertyInput,
  Property,
  UpdatePropertyInput,
} from "@/modules/properties/types/property.type.js";

export class InMemoryPropertyRepository implements PropertyRepository {
  public properties: Property[] = [];
  public users: Array<{ id: number }> = [{ id: 1 }];
  public stations: Array<{ id: number; property_id: number }> = [];
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

  async update(
    id: number,
    data: UpdatePropertyInput,
  ): Promise<Property | null> {
    const index = this.properties.findIndex((p) => p.id === id);
    if (index === -1) {
      return null;
    }

    const current = this.properties[index]!;
    const updated: Property = {
      ...current,
      name: data.name !== undefined ? data.name : current.name,
      owner_user_id:
        data.owner_user_id !== undefined
          ? data.owner_user_id
          : current.owner_user_id,
      location:
        data.location !== undefined
          ? (data.location ?? null)
          : current.location,
    };

    this.properties[index] = updated;
    return updated;
  }

  async hasStations(propertyId: number): Promise<boolean> {
    return this.stations.some((s) => s.property_id === propertyId);
  }

  async delete(id: number): Promise<boolean> {
    const index = this.properties.findIndex((p) => p.id === id);
    if (index === -1) {
      return false;
    }

    this.properties.splice(index, 1);
    return true;
  }
}
