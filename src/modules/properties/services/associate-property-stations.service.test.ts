import { beforeEach, describe, expect, it } from "vitest";

import { PropertyNotFoundError } from "@/modules/properties/errors/property.errors.js";
import { InMemoryPropertyRepository } from "@/modules/properties/repositories/in-memory-property.repository.js";
import { AssociatePropertyStationsService } from "@/modules/properties/services/associate-property-stations.service.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";

describe("AssociatePropertyStationsService", () => {
  let propertyRepository: InMemoryPropertyRepository;
  let stationRepository: InMemoryStationRepository;
  let service: AssociatePropertyStationsService;

  beforeEach(async () => {
    propertyRepository = new InMemoryPropertyRepository();
    stationRepository = new InMemoryStationRepository();
    service = new AssociatePropertyStationsService(
      propertyRepository,
      stationRepository,
    );

    // Setup initial property
    await propertyRepository.create({
      name: "Fazenda Sol",
      owner_user_id: 1,
      location: "Campinas - SP",
    });

    // Setup second property
    await propertyRepository.create({
      name: "Fazenda Lua",
      owner_user_id: 1,
      location: "Piracicaba - SP",
    });

    // Setup initial stations
    await stationRepository.create({
      name: "Estacao Alfa",
      mac_address: "AA:BB:CC:DD:EE:01",
      property_id: 1,
      latitude: -22.9,
      longitude: -47.0,
    });
    await stationRepository.create({
      name: "Estacao Beta",
      mac_address: "AA:BB:CC:DD:EE:02",
      property_id: 1,
      latitude: -22.8,
      longitude: -47.1,
    });
  });

  it("should associate a single station to property", async () => {
    const result = await service.execute(2, [1]);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(1);
    expect(result[0]!.property_id).toBe(2);

    const updatedInRepo = await stationRepository.findById(1);
    expect(updatedInRepo?.property_id).toBe(2);
  });

  it("should associate multiple stations to property", async () => {
    const result = await service.execute(2, [1, 2]);

    expect(result).toHaveLength(2);
    expect(result[0]!.property_id).toBe(2);
    expect(result[1]!.property_id).toBe(2);

    const station1 = await stationRepository.findById(1);
    const station2 = await stationRepository.findById(2);
    expect(station1?.property_id).toBe(2);
    expect(station2?.property_id).toBe(2);
  });

  it("should throw PropertyNotFoundError when property does not exist", async () => {
    await expect(service.execute(999, [1])).rejects.toThrow(
      PropertyNotFoundError,
    );
  });

  it("should throw StationNotFoundError when any station does not exist", async () => {
    await expect(service.execute(1, [999])).rejects.toThrow(
      StationNotFoundError,
    );
    await expect(service.execute(1, [1, 999])).rejects.toThrow(
      StationNotFoundError,
    );
  });
});
