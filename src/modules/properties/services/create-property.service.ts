import { UserReferenceNotFoundError } from "@/modules/properties/errors/property.errors.js";
import type { PropertyRepository } from "@/modules/properties/repositories/property.repository.js";
import type { PropertyBodyInput } from "@/modules/properties/schemas/property.schema.js";
import type { Property } from "@/modules/properties/types/property.type.js";

export class CreatePropertyService {
  constructor(private readonly propertyRepository: PropertyRepository) {}

  async execute(input: PropertyBodyInput): Promise<Property> {
    const userExists = await this.propertyRepository.userExists(
      input.owner_user_id,
    );

    if (!userExists) {
      throw new UserReferenceNotFoundError();
    }

    return this.propertyRepository.create(input);
  }
}
