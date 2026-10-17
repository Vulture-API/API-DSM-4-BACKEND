import type {
  CreatePropertyInput,
  Property,
} from "@/modules/properties/types/property.type.js";

export interface PropertyRepository {
  create(data: CreatePropertyInput): Promise<Property>;
  findById(id: number): Promise<Property | null>;
  userExists(userId: number): Promise<boolean>;
  listProperties(): Promise<
    Array<{ id: number; name: string; location: string | null }>
  >;
}
