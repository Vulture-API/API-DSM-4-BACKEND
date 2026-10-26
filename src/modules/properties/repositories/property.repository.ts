import type {
  CreatePropertyInput,
  Property,
  UpdatePropertyInput,
} from "@/modules/properties/types/property.type.js";

export interface PropertyRepository {
  create(data: CreatePropertyInput): Promise<Property>;
  findById(id: number): Promise<Property | null>;
  userExists(userId: number): Promise<boolean>;
  listProperties(): Promise<
    Array<{
      id: number;
      name: string;
      location: string | null;
      owner_user_id?: number | null;
    }>
  >;
  update(id: number, data: UpdatePropertyInput): Promise<Property | null>;
  hasStations(propertyId: number): Promise<boolean>;
  delete(id: number): Promise<boolean>;
}
