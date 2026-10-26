import { beforeEach, describe, expect, it } from "vitest";

import { DuplicateMacAddressError } from "@/modules/stations/errors/duplicate-mac-address.error.js";
import { PropertyNotFoundError } from "@/modules/stations/errors/property-not-found.error.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";
import { CreateStationService } from "@/modules/stations/services/create-station.service.js";

describe("CreateStationService", () => {
  let repository: InMemoryStationRepository;
  let service: CreateStationService;

  beforeEach(() => {
    repository = new InMemoryStationRepository();
    service = new CreateStationService(repository);
  });

  const validInput = {
    property_id: 1,
    mac_address: "AA:BB:CC:DD:EE:FF",
    name: "Estação Norte",
    latitude: -23.5,
    longitude: -46.6,
  };

  it("should_create_station_when_input_is_valid", async () => {
    const station = await service.execute(validInput);

    expect(station).toMatchObject({
      id: 1,
      property_id: 1,
      mac_address: "AA:BB:CC:DD:EE:FF",
      name: "Estação Norte",
      latitude: -23.5,
      longitude: -46.6,
      last_communication_at: null,
    });
    expect(repository.stations).toHaveLength(1);
  });

  it("should_create_station_when_coordinates_are_null", async () => {
    const station = await service.execute({
      ...validInput,
      latitude: null,
      longitude: null,
    });

    expect(station.latitude).toBeNull();
    expect(station.longitude).toBeNull();
  });

  it("should_reject_when_mac_address_already_exists", async () => {
    await service.execute(validInput);

    await expect(
      service.execute({ ...validInput, name: "Outra Estação" }),
    ).rejects.toBeInstanceOf(DuplicateMacAddressError);
    expect(repository.stations).toHaveLength(1);
  });

  it("should_reject_when_property_does_not_exist", async () => {
    await expect(
      service.execute({ ...validInput, property_id: 999 }),
    ).rejects.toBeInstanceOf(PropertyNotFoundError);
  });
});
