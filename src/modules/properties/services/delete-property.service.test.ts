import { beforeEach, describe, expect, it } from "vitest";

import {
  PropertyDeletionConflictError,
  PropertyNotFoundError,
} from "@/modules/properties/errors/property.errors.js";
import { InMemoryPropertyRepository } from "@/modules/properties/repositories/in-memory-property.repository.js";
import { DeletePropertyService } from "@/modules/properties/services/delete-property.service.js";

describe("DeletePropertyService", () => {
  let repository: InMemoryPropertyRepository;
  let service: DeletePropertyService;

  beforeEach(async () => {
    repository = new InMemoryPropertyRepository();
    repository.users = [{ id: 1 }];
    service = new DeletePropertyService(repository);

    await repository.create({
      name: "Fazenda Santa Clara",
      owner_user_id: 1,
      location: "Piracicaba - SP",
    });
  });

  it("should_delete_property_when_it_exists_and_has_no_stations", async () => {
    await service.execute(1);

    const found = await repository.findById(1);
    expect(found).toBeNull();
    expect(repository.properties).toHaveLength(0);
  });

  it("should_throw_PropertyNotFoundError_when_property_does_not_exist", async () => {
    await expect(service.execute(999)).rejects.toBeInstanceOf(
      PropertyNotFoundError,
    );
  });

  it("should_throw_PropertyDeletionConflictError_when_property_has_associated_stations", async () => {
    repository.stations.push({
      id: 10,
      property_id: 1,
    });

    await expect(service.execute(1)).rejects.toBeInstanceOf(
      PropertyDeletionConflictError,
    );

    const found = await repository.findById(1);
    expect(found).not.toBeNull();
    expect(repository.properties).toHaveLength(1);
  });

  it("should_throw_PropertyNotFoundError_when_repository_delete_returns_false", async () => {
    repository.delete = async () => false;

    await expect(service.execute(1)).rejects.toBeInstanceOf(
      PropertyNotFoundError,
    );
  });
});
