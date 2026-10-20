import { beforeEach, describe, expect, it } from "vitest";

import { PropertyNotFoundError } from "@/modules/properties/errors/property.errors.js";
import { InMemoryPropertyRepository } from "@/modules/properties/repositories/in-memory-property.repository.js";
import { ListPropertyStationsService } from "@/modules/properties/services/list-property-stations.service.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";

describe("ListPropertyStationsService", () => {
  let propertyRepository: InMemoryPropertyRepository;
  let stationRepository: InMemoryStationRepository;
  let service: ListPropertyStationsService;

  beforeEach(async () => {
    propertyRepository = new InMemoryPropertyRepository();
    stationRepository = new InMemoryStationRepository();
    service = new ListPropertyStationsService(
      propertyRepository,
      stationRepository,
    );

    await propertyRepository.create({
      name: "Fazenda Primavera",
      owner_user_id: 1,
      location: "Campinas - SP",
    });

    await propertyRepository.create({
      name: "Fazenda Vazia",
      owner_user_id: 1,
      location: "Valinhos - SP",
    });

    await stationRepository.create({
      name: "Estacao Norte",
      mac_address: "11:22:33:44:55:66",
      property_id: 1,
      latitude: -22.9,
      longitude: -47.0,
    });
    await stationRepository.create({
      name: "Estacao Sul",
      mac_address: "11:22:33:44:55:77",
      property_id: 1,
      latitude: -22.8,
      longitude: -47.1,
    });
  });

  it("should return list of stations associated to property", async () => {
    const stations = await service.execute(1);

    expect(stations).toHaveLength(2);
    expect(stations[0]!.name).toBe("Estacao Norte");
    expect(stations[1]!.name).toBe("Estacao Sul");
  });

  it("should return empty array if property has no stations", async () => {
    const stations = await service.execute(2);

    expect(stations).toHaveLength(0);
  });

  it("should throw PropertyNotFoundError when property does not exist", async () => {
    await expect(service.execute(999)).rejects.toThrow(PropertyNotFoundError);
  });
});
