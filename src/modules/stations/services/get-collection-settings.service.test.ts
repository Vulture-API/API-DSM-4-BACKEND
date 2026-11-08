import { beforeEach, describe, expect, it } from "vitest";

import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";
import { GetCollectionSettingsService } from "@/modules/stations/services/get-collection-settings.service.js";

describe("GetCollectionSettingsService", () => {
  let repository: InMemoryStationRepository;
  let service: GetCollectionSettingsService;

  beforeEach(async () => {
    repository = new InMemoryStationRepository();
    service = new GetCollectionSettingsService(repository, 10);
    await repository.create({
      property_id: 1,
      mac_address: "AA:BB:CC:DD:EE:01",
      name: "Estação Sul",
      latitude: null,
      longitude: null,
    });
  });

  it("should_return_the_default_interval_for_a_station_never_configured", async () => {
    await expect(service.execute(1)).resolves.toEqual({
      station_id: 1,
      mac_address: "AA:BB:CC:DD:EE:01",
      collection_interval_seconds: 60,
      min_interval_seconds: 10,
      max_interval_seconds: 300,
    });
  });

  it("should_return_the_interval_saved_for_the_station", async () => {
    repository.collectionIntervals.set(1, 120);

    const settings = await service.execute(1);

    expect(settings.collection_interval_seconds).toBe(120);
  });

  it("should_derive_the_maximum_from_the_offline_threshold", async () => {
    const settings = await new GetCollectionSettingsService(
      repository,
      30,
    ).execute(1);

    expect(settings.max_interval_seconds).toBe(900);
  });

  it("should_fail_when_the_station_does_not_exist", async () => {
    await expect(service.execute(999)).rejects.toBeInstanceOf(
      StationNotFoundError,
    );
  });
});
