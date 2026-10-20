import { beforeEach, describe, expect, it } from "vitest";

import {
  PropertyNotFoundError,
  UserReferenceNotFoundError,
} from "@/modules/properties/errors/property.errors.js";
import { InMemoryPropertyRepository } from "@/modules/properties/repositories/in-memory-property.repository.js";
import { UpdatePropertyService } from "@/modules/properties/services/update-property.service.js";

describe("UpdatePropertyService", () => {
  let repository: InMemoryPropertyRepository;
  let service: UpdatePropertyService;

  beforeEach(async () => {
    repository = new InMemoryPropertyRepository();
    repository.users = [{ id: 1 }, { id: 2 }];
    service = new UpdatePropertyService(repository);

    await repository.create({
      name: "Fazenda Original",
      owner_user_id: 1,
      location: "Campinas - SP",
    });
  });

  it("should_update_property_when_all_fields_are_valid", async () => {
    const updated = await service.execute(1, {
      name: "Fazenda Atualizada",
      owner_user_id: 2,
      location: "Piracicaba - SP",
    });

    expect(updated).toMatchObject({
      id: 1,
      name: "Fazenda Atualizada",
      owner_user_id: 2,
      location: "Piracicaba - SP",
    });

    const stored = await repository.findById(1);
    expect(stored).toEqual(updated);
  });

  it("should_update_only_name_when_only_name_is_provided", async () => {
    const updated = await service.execute(1, {
      name: "Novo Nome de Fazenda",
    });

    expect(updated).toMatchObject({
      id: 1,
      name: "Novo Nome de Fazenda",
      owner_user_id: 1,
      location: "Campinas - SP",
    });
  });

  it("should_update_only_location_when_only_location_is_provided", async () => {
    const updated = await service.execute(1, {
      location: "Sorocaba - SP",
    });

    expect(updated).toMatchObject({
      id: 1,
      name: "Fazenda Original",
      owner_user_id: 1,
      location: "Sorocaba - SP",
    });
  });

  it("should_allow_setting_location_to_null", async () => {
    const updated = await service.execute(1, {
      location: null,
    });

    expect(updated).toMatchObject({
      id: 1,
      name: "Fazenda Original",
      owner_user_id: 1,
      location: null,
    });
  });

  it("should_throw_PropertyNotFoundError_when_property_does_not_exist", async () => {
    await expect(
      service.execute(999, {
        name: "Inexistente",
      }),
    ).rejects.toBeInstanceOf(PropertyNotFoundError);
  });

  it("should_throw_UserReferenceNotFoundError_when_owner_user_id_does_not_exist", async () => {
    await expect(
      service.execute(1, {
        owner_user_id: 9999,
      }),
    ).rejects.toBeInstanceOf(UserReferenceNotFoundError);

    const stored = await repository.findById(1);
    expect(stored?.name).toBe("Fazenda Original");
  });

  it("should_throw_PropertyNotFoundError_when_repository_update_returns_null", async () => {
    repository.update = async () => null;

    await expect(
      service.execute(1, {
        name: "Fazenda Teste",
      }),
    ).rejects.toBeInstanceOf(PropertyNotFoundError);
  });
});
