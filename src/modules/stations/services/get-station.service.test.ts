import { beforeEach, describe, expect, it } from "vitest";

import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";
import { GetStationService } from "@/modules/stations/services/get-station.service.js";

describe("GetStationService", () => {
  let repository: InMemoryStationRepository;
  let service: GetStationService;

  beforeEach(() => {
    repository = new InMemoryStationRepository();
    service = new GetStationService(repository);
  });

  it("should_return_station_when_id_exists", async () => {
    const created = await repository.create({
      property_id: 1,
      mac_address: "AA:BB:CC:DD:EE:01",
      name: "Estação Sul",
      latitude: null,
      longitude: null,
    });

    await expect(service.execute(created.id)).resolves.toEqual(created);
  });

  it("should_reject_when_station_does_not_exist", async () => {
    await expect(service.execute(404)).rejects.toBeInstanceOf(
      StationNotFoundError,
    );
  });
});
