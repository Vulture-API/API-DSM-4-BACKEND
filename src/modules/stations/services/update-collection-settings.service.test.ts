import { beforeEach, describe, expect, it } from "vitest";

import { InvalidCollectionIntervalError } from "@/modules/stations/errors/invalid-collection-interval.error.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";
import { UpdateCollectionSettingsService } from "@/modules/stations/services/update-collection-settings.service.js";

describe("UpdateCollectionSettingsService", () => {
  let repository: InMemoryStationRepository;
  let service: UpdateCollectionSettingsService;

  const station = (n: number) => ({
    property_id: 1,
    mac_address: `AA:BB:CC:DD:EE:0${n}`,
    name: `Estação ${n}`,
    latitude: null,
    longitude: null,
  });

  beforeEach(async () => {
    repository = new InMemoryStationRepository();
    service = new UpdateCollectionSettingsService(repository, 10);
    await repository.create(station(1));
    await repository.create(station(2));
  });

  it("should_save_a_valid_interval_and_return_the_new_settings", async () => {
    await expect(service.execute(1, 120)).resolves.toEqual({
      station_id: 1,
      mac_address: "AA:BB:CC:DD:EE:01",
      collection_interval_seconds: 120,
      min_interval_seconds: 10,
      max_interval_seconds: 300,
    });
  });

  it("should_change_only_the_station_informed", async () => {
    await service.execute(2, 30);

    expect(repository.collectionIntervals.get(2)).toBe(30);
    expect(repository.collectionIntervals.has(1)).toBe(false);
  });

  it("should_accept_the_minimum_and_the_maximum", async () => {
    await expect(service.execute(1, 10)).resolves.toMatchObject({
      collection_interval_seconds: 10,
    });
    await expect(service.execute(1, 300)).resolves.toMatchObject({
      collection_interval_seconds: 300,
    });
  });

  it.each([9, 301, 0, -1, 60.5])(
    "should_reject_%s_seconds_without_saving",
    async (seconds) => {
      await expect(service.execute(1, seconds)).rejects.toBeInstanceOf(
        InvalidCollectionIntervalError,
      );
      expect(repository.collectionIntervals.has(1)).toBe(false);
    },
  );

  it("should_report_the_allowed_range_in_the_error", async () => {
    await expect(service.execute(1, 301)).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_COLLECTION_INTERVAL",
      message:
        "Collection interval must be an integer between 10 and 300 seconds.",
    });
  });

  it("should_fail_when_the_station_does_not_exist", async () => {
    await expect(service.execute(999, 60)).rejects.toBeInstanceOf(
      StationNotFoundError,
    );
  });

  it("should_validate_before_looking_up_the_station", async () => {
    await expect(service.execute(999, 5)).rejects.toBeInstanceOf(
      InvalidCollectionIntervalError,
    );
  });
});
