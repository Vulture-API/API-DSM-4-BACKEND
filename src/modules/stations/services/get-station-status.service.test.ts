import { beforeEach, describe, expect, it } from "vitest";

import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";
import { GetStationStatusService } from "@/modules/stations/services/get-station-status.service.js";

describe("GetStationStatusService", () => {
  const now = new Date("2026-09-23T22:50:00.000Z");

  let repository: InMemoryStationRepository;
  let service: GetStationStatusService;

  beforeEach(() => {
    repository = new InMemoryStationRepository();
    service = new GetStationStatusService(repository, 10, () => now);
  });

  async function createStation(lastCommunicationAt: Date | null) {
    const station = await repository.create({
      property_id: 1,
      mac_address: "AA:BB:CC:DD:EE:01",
      name: "Estação Sul",
      latitude: null,
      longitude: null,
    });

    station.last_communication_at = lastCommunicationAt;

    return station;
  }

  it("should_return_online_when_last_communication_is_within_threshold", async () => {
    await createStation(new Date("2026-09-23T22:41:00.000Z"));

    await expect(service.execute(1)).resolves.toEqual({
      station_id: 1,
      status: "Online",
      last_communication_at: new Date("2026-09-23T22:41:00.000Z"),
      checked_at: now,
      offline_threshold_minutes: 10,
    });
  });

  it("should_return_online_when_last_communication_is_exactly_at_threshold", async () => {
    await createStation(new Date("2026-09-23T22:40:00.000Z"));

    await expect(service.execute(1)).resolves.toMatchObject({
      status: "Online",
    });
  });

  it("should_return_offline_when_last_communication_exceeds_threshold", async () => {
    await createStation(new Date("2026-09-23T22:39:59.999Z"));

    await expect(service.execute(1)).resolves.toMatchObject({
      status: "Offline",
    });
  });

  it("should_return_offline_when_station_has_never_communicated", async () => {
    await createStation(null);

    await expect(service.execute(1)).resolves.toMatchObject({
      status: "Offline",
      last_communication_at: null,
    });
  });

  it("should_return_online_when_last_communication_is_in_the_future", async () => {
    await createStation(new Date("2026-09-23T22:51:00.000Z"));

    await expect(service.execute(1)).resolves.toMatchObject({
      status: "Online",
    });
  });

  it("should_reject_when_station_does_not_exist", async () => {
    await expect(service.execute(404)).rejects.toBeInstanceOf(
      StationNotFoundError,
    );
  });
});
