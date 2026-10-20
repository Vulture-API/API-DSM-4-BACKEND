import { UserReferenceNotFoundError } from "@/modules/properties/errors/property.errors.js";
import type { PropertyRepository } from "@/modules/properties/repositories/property.repository.js";
import type {
  CreatePropertyInput,
  Property,
} from "@/modules/properties/types/property.type.js";

export class CreatePropertyService {
  constructor(private readonly propertyRepository: PropertyRepository) {}

  async execute(input: CreatePropertyInput): Promise<Property> {
    const userExists = await this.propertyRepository.userExists(
      input.owner_user_id,
    );

    if (!userExists) {
      throw new UserReferenceNotFoundError();
    }

    return this.propertyRepository.create({
      name: input.name,
      owner_user_id: input.owner_user_id,
      location: input.location ?? null,
    });
  }
}
