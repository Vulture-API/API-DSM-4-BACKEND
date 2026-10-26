import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DuplicateMacAddressError } from "@/modules/stations/errors/duplicate-mac-address.error.js";
import { PgStationRepository } from "@/modules/stations/repositories/pg-station.repository.js";

describe("PgStationRepository", () => {
  const query = vi.fn();
  let repository: PgStationRepository;

  beforeEach(() => {
    query.mockReset();
    repository = new PgStationRepository({ query } as unknown as Pool);
  });

  it("should_translate_unique_violation_on_create", async () => {
    query.mockRejectedValueOnce({
      code: "23505",
      constraint: "stations_mac_address_unique",
    });

    await expect(
      repository.create({
        property_id: 1,
        mac_address: "AA:BB:CC:DD:EE:01",
        name: "Estação",
        latitude: null,
        longitude: null,
      }),
    ).rejects.toBeInstanceOf(DuplicateMacAddressError);
  });

  it("should_rethrow_non_unique_errors_on_create", async () => {
    const error = { code: "23503" };
    query.mockRejectedValueOnce(error);

    await expect(
      repository.create({
        property_id: 999,
        mac_address: "AA:BB:CC:DD:EE:01",
        name: "Estação",
        latitude: null,
        longitude: null,
      }),
    ).rejects.toBe(error);
  });

  it("should_keep_total_records_when_page_is_empty", async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: null, total_records: "3" }],
    });

    const result = await repository.findMany({ page: 5, limit: 2 });

    expect(result).toEqual({
      data: [],
      total_records: 3,
    });
  });

  it("should_return_records_and_total_on_find_many", async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          property_id: 1,
          mac_address: "AA:BB:CC:DD:EE:01",
          name: "Estação 1",
          latitude: -23.5,
          longitude: -46.6,
          last_communication_at: null,
          created_at: "2026-09-20T10:00:00.000Z",
          total_records: "2",
        },
      ],
    });

    const result = await repository.findMany({ page: 1, limit: 10 });

    expect(result.total_records).toBe(2);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.id).toBe(1);
  });

  it("should_translate_unique_violation_on_update", async () => {
    query.mockRejectedValueOnce({
      code: "23505",
      constraint: "stations_mac_address_unique",
    });

    await expect(
      repository.update(1, {
        property_id: 1,
        mac_address: "AA:BB:CC:DD:EE:02",
        name: "Estação 2",
        latitude: null,
        longitude: null,
      }),
    ).rejects.toBeInstanceOf(DuplicateMacAddressError);
  });

  it("should_update_station_when_it_exists", async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          property_id: 1,
          mac_address: "AA:BB:CC:DD:EE:02",
          name: "Estação 2",
          latitude: null,
          longitude: null,
          last_communication_at: null,
          created_at: "2026-09-20T10:00:00.000Z",
        },
      ],
    });

    const result = await repository.update(1, {
      property_id: 1,
      mac_address: "AA:BB:CC:DD:EE:02",
      name: "Estação 2",
      latitude: null,
      longitude: null,
    });

    expect(result?.id).toBe(1);
  });

  it("should_return_null_when_update_does_not_find_station", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const result = await repository.update(999, {
      property_id: 1,
      mac_address: "AA:BB:CC:DD:EE:99",
      name: "Estação 99",
      latitude: null,
      longitude: null,
    });

    expect(result).toBeNull();
  });

  it("should_return_station_on_find_by_id", async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 1, mac_address: "AA:BB:CC:DD:EE:01" }],
    });

    const result = await repository.findById(1);

    expect(result?.id).toBe(1);
  });

  it("should_return_null_on_find_by_id_when_missing", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const result = await repository.findById(999);

    expect(result).toBeNull();
  });

  it("should_return_station_on_find_by_mac_address", async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 1, mac_address: "AA:BB:CC:DD:EE:01" }],
    });

    const result = await repository.findByMacAddress("AA:BB:CC:DD:EE:01");

    expect(result?.mac_address).toBe("AA:BB:CC:DD:EE:01");
  });

  it("should_return_null_on_find_by_mac_address_when_missing", async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const result = await repository.findByMacAddress("AA:BB:CC:DD:EE:FF");

    expect(result).toBeNull();
  });

  it("should_return_true_on_delete_when_a_row_is_deleted", async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });

    const result = await repository.delete(1);

    expect(result).toBe(true);
  });

  it("should_return_false_on_delete_when_no_row_is_deleted", async () => {
    query.mockResolvedValueOnce({ rowCount: 0 });

    const result = await repository.delete(999);

    expect(result).toBe(false);
  });

  it("should_return_true_when_property_exists", async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });

    const result = await repository.propertyExists(1);

    expect(result).toBe(true);
  });

  it("should_return_false_when_property_does_not_exist", async () => {
    query.mockResolvedValueOnce({ rowCount: 0 });

    const result = await repository.propertyExists(999);

    expect(result).toBe(false);
  });
});
