import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";

describe("station collection settings routes", () => {
  let app: FastifyInstance;
  let repository: InMemoryStationRepository;

  beforeEach(async () => {
    repository = new InMemoryStationRepository();
    app = buildApp({
      stationRepository: repository,
      stationOfflineThresholdMinutes: 10,
    });
    await app.ready();
    await repository.create({
      property_id: 1,
      mac_address: "AA:BB:CC:DD:EE:01",
      name: "Estação Norte",
      latitude: null,
      longitude: null,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  const put = (id: number | string, payload: unknown) =>
    app.inject({
      method: "PUT",
      url: `/api/stations/${id}/collection`,
      payload: payload as Record<string, unknown>,
    });

  it("should_return_the_current_collection_settings", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/stations/1/collection",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      station_id: 1,
      mac_address: "AA:BB:CC:DD:EE:01",
      collection_interval_seconds: 60,
      min_interval_seconds: 10,
      max_interval_seconds: 300,
    });
  });

  it("should_update_the_interval_and_return_it_on_the_next_read", async () => {
    const updated = await put(1, { collection_interval_seconds: 30 });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().collection_interval_seconds).toBe(30);

    const read = await app.inject({
      method: "GET",
      url: "/api/stations/1/collection",
    });
    expect(read.json().collection_interval_seconds).toBe(30);
  });

  it("should_reject_an_interval_outside_the_allowed_range", async () => {
    const response = await put(1, { collection_interval_seconds: 301 });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_COLLECTION_INTERVAL");
  });

  it.each([
    ["missing", {}],
    ["text", { collection_interval_seconds: "60" }],
    ["fractional", { collection_interval_seconds: 60.5 }],
  ])(
    "should_return_validation_error_when_interval_is_%s",
    async (_case, body) => {
      const response = await put(1, body);

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("VALIDATION_ERROR");
    },
  );

  it("should_return_not_found_for_an_unknown_station", async () => {
    const read = await app.inject({
      method: "GET",
      url: "/api/stations/999/collection",
    });
    const update = await put(999, { collection_interval_seconds: 60 });

    expect(read.statusCode).toBe(404);
    expect(read.json().code).toBe("STATION_NOT_FOUND");
    expect(update.statusCode).toBe(404);
  });

  it("should_keep_the_status_endpoint_working", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/stations/1/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().station_id).toBe(1);
  });
});
