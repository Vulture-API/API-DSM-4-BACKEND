import { beforeEach, describe, expect, it } from "vitest";

import { DuplicateMacAddressError } from "@/modules/stations/errors/duplicate-mac-address.error.js";
import { PropertyNotFoundError } from "@/modules/stations/errors/property-not-found.error.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";
import { UpdateStationService } from "@/modules/stations/services/update-station.service.js";

describe("UpdateStationService", () => {
  let repository: InMemoryStationRepository;
  let service: UpdateStationService;

  const baseInput = {
    property_id: 1,
    mac_address: "AA:BB:CC:DD:EE:01",
    name: "Estação Original",
    latitude: null,
    longitude: null,
  };

  beforeEach(async () => {
    repository = new InMemoryStationRepository();
    service = new UpdateStationService(repository);

    await repository.create(baseInput);
    await repository.create({ ...baseInput, mac_address: "AA:BB:CC:DD:EE:02" });
  });

  it("should_update_station_when_input_is_valid", async () => {
    const updated = await service.execute(1, {
      ...baseInput,
      name: "Estação Renomeada",
      latitude: -22.9,
      longitude: -43.2,
    });

    expect(updated).toMatchObject({
      id: 1,
      name: "Estação Renomeada",
      latitude: -22.9,
      longitude: -43.2,
    });
  });

  it("should_allow_keeping_its_own_mac_address", async () => {
    const updated = await service.execute(1, baseInput);

    expect(updated.mac_address).toBe("AA:BB:CC:DD:EE:01");
  });

  it("should_reject_when_mac_address_belongs_to_another_station", async () => {
    await expect(
      service.execute(1, { ...baseInput, mac_address: "AA:BB:CC:DD:EE:02" }),
    ).rejects.toBeInstanceOf(DuplicateMacAddressError);
  });

  it("should_reject_when_station_does_not_exist", async () => {
    await expect(service.execute(999, baseInput)).rejects.toBeInstanceOf(
      StationNotFoundError,
    );
  });

  it("should_reject_when_property_does_not_exist", async () => {
    await expect(
      service.execute(1, { ...baseInput, property_id: 999 }),
    ).rejects.toBeInstanceOf(PropertyNotFoundError);
  });
});
