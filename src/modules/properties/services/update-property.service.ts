import {
  PropertyNotFoundError,
  UserReferenceNotFoundError,
} from "@/modules/properties/errors/property.errors.js";
import type { PropertyRepository } from "@/modules/properties/repositories/property.repository.js";
import type {
  Property,
  UpdatePropertyInput,
} from "@/modules/properties/types/property.type.js";

export class UpdatePropertyService {
  constructor(private readonly propertyRepository: PropertyRepository) {}

  async execute(id: number, input: UpdatePropertyInput): Promise<Property> {
    const existing = await this.propertyRepository.findById(id);

    if (!existing) {
      throw new PropertyNotFoundError();
    }

    if (input.owner_user_id !== undefined) {
      const userExists = await this.propertyRepository.userExists(
        input.owner_user_id,
      );

      if (!userExists) {
        throw new UserReferenceNotFoundError();
      }
    }

    const updated = await this.propertyRepository.update(id, input);

    if (!updated) {
      throw new PropertyNotFoundError();
    }

    return updated;
  }
}
