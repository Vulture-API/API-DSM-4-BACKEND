import type { PropertyRepository } from "@/modules/properties/repositories/property.repository.js";

export class ListPropertiesService {
  constructor(private readonly propertyRepository: PropertyRepository) {}

  async execute(): Promise<
    Array<{
      id: number;
      name: string;
      location: string | null;
      owner_user_id?: number | null;
    }>
  > {
    return this.propertyRepository.listProperties();
  }
}
