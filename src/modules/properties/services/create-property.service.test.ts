import { beforeEach, describe, expect, it } from "vitest";

import { UserReferenceNotFoundError } from "@/modules/properties/errors/property.errors.js";
import { InMemoryPropertyRepository } from "@/modules/properties/repositories/in-memory-property.repository.js";
import { CreatePropertyService } from "@/modules/properties/services/create-property.service.js";

describe("CreatePropertyService", () => {
  let repository: InMemoryPropertyRepository;
  let service: CreatePropertyService;

  beforeEach(() => {
    repository = new InMemoryPropertyRepository();
    repository.users = [{ id: 1 }, { id: 2 }];
    service = new CreatePropertyService(repository);
  });

  const validInput = {
    name: "Fazenda Santa Inês",
    owner_user_id: 1,
    location: "São José dos Campos - SP",
  };

  it("should_create_property_when_input_is_valid", async () => {
    const property = await service.execute(validInput);

    expect(property).toMatchObject({
      id: 1,
      name: "Fazenda Santa Inês",
      owner_user_id: 1,
      location: "São José dos Campos - SP",
    });
    expect(property.created_at).toBeDefined();
    expect(repository.properties).toHaveLength(1);
  });

  it("should_create_property_when_location_is_null", async () => {
    const property = await service.execute({
      name: "Fazenda Esperança",
      owner_user_id: 2,
      location: null,
    });

    expect(property.id).toBe(1);
    expect(property.name).toBe("Fazenda Esperança");
    expect(property.owner_user_id).toBe(2);
    expect(property.location).toBeNull();
    expect(repository.properties).toHaveLength(1);
  });

  it("should_create_property_when_location_is_omitted", async () => {
    const property = await service.execute({
      name: "Fazenda Boa Vista",
      owner_user_id: 1,
    });

    expect(property.id).toBe(1);
    expect(property.name).toBe("Fazenda Boa Vista");
    expect(property.owner_user_id).toBe(1);
    expect(property.location).toBeNull();
  });

  it("should_reject_when_owner_user_does_not_exist", async () => {
    await expect(
      service.execute({
        ...validInput,
        owner_user_id: 9999,
      }),
    ).rejects.toBeInstanceOf(UserReferenceNotFoundError);

    expect(repository.properties).toHaveLength(0);
  });
});
