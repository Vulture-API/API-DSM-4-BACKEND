import {
  PropertyDeletionConflictError,
  PropertyNotFoundError,
} from "@/modules/properties/errors/property.errors.js";
import type { PropertyRepository } from "@/modules/properties/repositories/property.repository.js";

export class DeletePropertyService {
  constructor(private readonly propertyRepository: PropertyRepository) {}

  async execute(id: number): Promise<void> {
    const existing = await this.propertyRepository.findById(id);

    if (!existing) {
      throw new PropertyNotFoundError();
    }

    const hasStations = await this.propertyRepository.hasStations(id);

    if (hasStations) {
      throw new PropertyDeletionConflictError();
    }

    const deleted = await this.propertyRepository.delete(id);

    if (!deleted) {
      throw new PropertyNotFoundError();
    }
  }
}
