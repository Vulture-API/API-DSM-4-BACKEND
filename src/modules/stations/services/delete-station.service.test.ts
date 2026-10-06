import { beforeEach, describe, expect, it } from "vitest";

import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";
import { DeleteStationService } from "@/modules/stations/services/delete-station.service.js";

describe("DeleteStationService", () => {
  let repository: InMemoryStationRepository;
  let service: DeleteStationService;

  beforeEach(() => {
    repository = new InMemoryStationRepository();
    service = new DeleteStationService(repository);
  });

  it("should_delete_station_when_id_exists", async () => {
    const created = await repository.create({
      property_id: 1,
      mac_address: "AA:BB:CC:DD:EE:01",
      name: "Estação Temporária",
      latitude: null,
      longitude: null,
    });

    await service.execute(created.id);

    expect(repository.stations).toHaveLength(0);
  });

  it("should_reject_when_station_does_not_exist", async () => {
    await expect(service.execute(999)).rejects.toBeInstanceOf(
      StationNotFoundError,
    );
  });
});
