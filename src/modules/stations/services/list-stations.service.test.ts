import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";
import { ListStationsService } from "@/modules/stations/services/list-stations.service.js";

describe("ListStationsService", () => {
  let repository: InMemoryStationRepository;
  let service: ListStationsService;

  beforeEach(async () => {
    repository = new InMemoryStationRepository();
    service = new ListStationsService(repository);

    for (let index = 0; index < 25; index++) {
      await repository.create({
        property_id: index < 10 ? 1 : 2,
        mac_address: `AA:BB:CC:DD:EE:${index.toString(16).padStart(2, "0").toUpperCase()}`,
        name: `Estação ${index}`,
        latitude: null,
        longitude: null,
      });
    }
  });

  it("should_return_empty_list_when_there_are_no_stations", async () => {
    const emptyService = new ListStationsService(
      new InMemoryStationRepository(),
    );

    const result = await emptyService.execute({ page: 1, limit: 20 });

    expect(result.data).toEqual([]);
    expect(result.meta).toEqual({
      total_records: 0,
      total_pages: 0,
      current_page: 1,
    });
  });

  it("should_paginate_results_when_page_and_limit_are_provided", async () => {
    const result = await service.execute({ page: 2, limit: 20 });

    expect(result.data).toHaveLength(5);
    expect(result.meta).toEqual({
      total_records: 25,
      total_pages: 2,
      current_page: 2,
    });
  });

  it("should_filter_by_property_id_when_provided", async () => {
    const result = await service.execute({
      page: 1,
      limit: 20,
      property_id: 2,
    });

    expect(result.meta.total_records).toBe(15);
    expect(result.data.every((station) => station.property_id === 2)).toBe(
      true,
    );
  });

  it("should_return_empty_page_when_page_is_beyond_total", async () => {
    const result = await service.execute({ page: 99, limit: 20 });

    expect(result.data).toEqual([]);
    expect(result.meta.total_records).toBe(25);
  });
});
