import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";

describe("station routes", () => {
  const now = new Date("2026-09-23T22:50:00.000Z");

  let app: FastifyInstance;
  let repository: InMemoryStationRepository;

  const validPayload = {
    property_id: 1,
    mac_address: "AA:BB:CC:DD:EE:FF",
    name: "Estação Norte",
    latitude: -23.5,
    longitude: -46.6,
  };

  beforeEach(async () => {
    repository = new InMemoryStationRepository();
    app = buildApp({
      stationRepository: repository,
      stationOfflineThresholdMinutes: 10,
      clock: () => now,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  async function createStation(overrides: Record<string, unknown> = {}) {
    return app.inject({
      method: "POST",
      url: "/api/stations",
      payload: { ...validPayload, ...overrides },
    });
  }

  it("should_create_station_when_payload_is_valid", async () => {
    const response = await createStation();

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: 1,
      property_id: 1,
      mac_address: "AA:BB:CC:DD:EE:FF",
      name: "Estação Norte",
    });
  });

  it("should_normalize_mac_address_to_uppercase_with_colons", async () => {
    const response = await createStation({ mac_address: "aa-bb-cc-dd-ee-01" });

    expect(response.json().mac_address).toBe("AA:BB:CC:DD:EE:01");
  });

  it("should_return_validation_error_when_required_fields_are_missing", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/stations",
      payload: { name: "Só o nome" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("should_return_validation_error_when_mac_address_is_malformed", async () => {
    const response = await createStation({ mac_address: "nao-e-um-mac" });

    expect(response.statusCode).toBe(400);
  });

  it("should_return_validation_error_when_mac_address_mixes_separators", async () => {
    const response = await createStation({ mac_address: "AA:BB-CC:DD-EE:FF" });

    expect(response.statusCode).toBe(400);
  });

  it("should_accept_mac_address_with_hyphens_only", async () => {
    const response = await createStation({ mac_address: "AA-BB-CC-DD-EE-10" });

    expect(response.statusCode).toBe(201);
    expect(response.json().mac_address).toBe("AA:BB:CC:DD:EE:10");
  });

  it("should_return_validation_error_when_latitude_is_out_of_range", async () => {
    const response = await createStation({ latitude: 120 });

    expect(response.statusCode).toBe(400);
  });

  it("should_return_conflict_when_mac_address_is_duplicated", async () => {
    await createStation();

    const response = await createStation({ name: "Outra" });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("DUPLICATE_MAC_ADDRESS");
  });

  it("should_return_conflict_when_property_does_not_exist", async () => {
    const response = await createStation({ property_id: 999 });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("PROPERTY_NOT_FOUND");
  });

  it("should_list_stations_with_pagination_meta", async () => {
    await createStation();
    await createStation({ mac_address: "AA:BB:CC:DD:EE:02" });

    const response = await app.inject({
      method: "GET",
      url: "/api/stations?page=1&limit=1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().meta).toEqual({
      total_records: 2,
      total_pages: 2,
      current_page: 1,
    });
  });

  it("should_filter_list_by_property_id", async () => {
    await createStation();
    await createStation({ mac_address: "AA:BB:CC:DD:EE:02", property_id: 2 });

    const response = await app.inject({
      method: "GET",
      url: "/api/stations?property_id=2",
    });

    expect(response.json().meta.total_records).toBe(1);
  });

  it("should_get_station_by_id", async () => {
    await createStation();

    const response = await app.inject({
      method: "GET",
      url: "/api/stations/1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(1);
  });

  it("should_return_detailed_online_station_status", async () => {
    await createStation();
    repository.stations[0]!.last_communication_at = new Date(
      "2026-09-23T22:41:00.000Z",
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/stations/1/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      station_id: 1,
      status: "Online",
      last_communication_at: "2026-09-23T22:41:00.000Z",
      checked_at: "2026-09-23T22:50:00.000Z",
      offline_threshold_minutes: 10,
    });
  });

  it("should_return_offline_station_status_when_it_never_communicated", async () => {
    await createStation();

    const response = await app.inject({
      method: "GET",
      url: "/api/stations/1/status",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      station_id: 1,
      status: "Offline",
      last_communication_at: null,
      offline_threshold_minutes: 10,
    });
  });

  it("should_return_not_found_when_getting_status_for_unknown_station", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/stations/999/status",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("STATION_NOT_FOUND");
  });

  it("should_return_validation_error_when_status_id_is_not_numeric", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/stations/abc/status",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
  });

  it("should_return_not_found_when_station_does_not_exist", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/stations/999",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("STATION_NOT_FOUND");
  });

  it("should_return_validation_error_when_id_is_not_numeric", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/stations/abc",
    });

    expect(response.statusCode).toBe(400);
  });

  it("should_update_station_when_payload_is_valid", async () => {
    await createStation();

    const response = await app.inject({
      method: "PUT",
      url: "/api/stations/1",
      payload: { ...validPayload, name: "Estação Atualizada" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe("Estação Atualizada");
  });

  it("should_return_not_found_when_updating_unknown_station", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/stations/999",
      payload: validPayload,
    });

    expect(response.statusCode).toBe(404);
  });

  it("should_delete_station_and_return_no_content", async () => {
    await createStation();

    const response = await app.inject({
      method: "DELETE",
      url: "/api/stations/1",
    });

    expect(response.statusCode).toBe(204);
    expect(repository.stations).toHaveLength(0);
  });

  it("should_return_not_found_when_deleting_unknown_station", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/stations/999",
    });

    expect(response.statusCode).toBe(404);
  });

  it("should_expose_health_endpoint", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", rules_engine: false });
  });

  it("should_not_expose_routes_without_api_prefix", async () => {
    const response = await app.inject({ method: "GET", url: "/stations" });

    expect(response.statusCode).toBe(404);
  });
});
