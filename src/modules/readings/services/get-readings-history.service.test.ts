import { beforeEach, describe, expect, it } from "vitest";

import { ApplicationError } from "@/errors/application.error.js";
import { InMemoryReadingRepository } from "@/modules/readings/repositories/in-memory-reading.repository.js";
import { GetReadingsHistoryService } from "@/modules/readings/services/get-readings-history.service.js";

describe("GetReadingsHistoryService", () => {
  let repository: InMemoryReadingRepository;
  let service: GetReadingsHistoryService;

  beforeEach(() => {
    repository = new InMemoryReadingRepository();
    service = new GetReadingsHistoryService(repository);

    repository.readings = [
      {
        id: 1,
        sensor_id: 10,
        station_id: 1,
        value: 23.5,
        unix_time: 1728000000,
        data_consistent: true,
        created_at: new Date("2024-10-04T00:00:00.000Z"),
      },
      {
        id: 2,
        sensor_id: 10,
        station_id: 1,
        value: 24.1,
        unix_time: 1728003600,
        data_consistent: true,
        created_at: new Date("2024-10-04T01:00:00.000Z"),
      },
      {
        id: 3,
        sensor_id: 20,
        station_id: 2,
        value: 65.0,
        unix_time: 1728007200,
        data_consistent: true,
        created_at: new Date("2024-10-04T02:00:00.000Z"),
      },
    ];
  });

  it("should_return_all_readings_paginated_ordered_by_time_desc", async () => {
    const result = await service.execute({ page: 1, limit: 10 });

    expect(result.data).toHaveLength(3);
    expect(result.data[0]?.id).toBe(3);
    expect(result.data[1]?.id).toBe(2);
    expect(result.data[2]?.id).toBe(1);
    expect(result.meta).toEqual({
      total_records: 3,
      total_pages: 1,
      current_page: 1,
    });
  });

  it("should_filter_readings_by_sensor_id", async () => {
    const result = await service.execute({ page: 1, limit: 10, sensor_id: 10 });

    expect(result.data).toHaveLength(2);
    expect(result.data.every((r) => r.sensor_id === 10)).toBe(true);
    expect(result.meta.total_records).toBe(2);
  });

  it("should_filter_readings_by_station_id", async () => {
    const result = await service.execute({
      page: 1,
      limit: 10,
      station_id: 2,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe(3);
    expect(result.meta.total_records).toBe(1);
  });

  it("should_filter_readings_by_time_range", async () => {
    const result = await service.execute({
      page: 1,
      limit: 10,
      start_unix_time: 1728001000,
      end_unix_time: 1728005000,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe(2);
    expect(result.meta.total_records).toBe(1);
  });

  it("should_handle_empty_results_when_no_readings_match", async () => {
    const result = await service.execute({
      page: 1,
      limit: 10,
      sensor_id: 999,
    });

    expect(result.data).toEqual([]);
    expect(result.meta).toEqual({
      total_records: 0,
      total_pages: 0,
      current_page: 1,
    });
  });

  it("should_paginate_correctly_when_multiple_pages_exist", async () => {
    const result = await service.execute({ page: 2, limit: 2 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe(1);
    expect(result.meta).toEqual({
      total_records: 3,
      total_pages: 2,
      current_page: 2,
    });
  });

  it("should_throw_error_when_start_unix_time_exceeds_end_unix_time", async () => {
    const act = () =>
      service.execute({
        page: 1,
        limit: 10,
        start_unix_time: 2000,
        end_unix_time: 1000,
      });

    await expect(act).rejects.toThrow(ApplicationError);
  });

  it("should_filter_readings_by_start_date_and_end_date_calendar_day", async () => {
    const result = await service.execute({
      page: 1,
      limit: 10,
      start_date: "2024-10-04",
      end_date: "2024-10-04",
    });

    expect(result.data).toHaveLength(3);
    expect(result.meta.total_records).toBe(3);
  });

  it("should_filter_readings_by_iso_datetime_range", async () => {
    const result = await service.execute({
      page: 1,
      limit: 10,
      start_date: "2024-10-04T00:30:00.000Z",
      end_date: "2024-10-04T01:30:00.000Z",
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe(2);
    expect(result.meta.total_records).toBe(1);
  });

  it("should_filter_readings_when_only_start_date_is_provided", async () => {
    const result = await service.execute({
      page: 1,
      limit: 10,
      start_date: "2024-10-04T01:30:00.000Z",
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe(3);
    expect(result.meta.total_records).toBe(1);
  });

  it("should_filter_readings_when_only_end_date_is_provided", async () => {
    const result = await service.execute({
      page: 1,
      limit: 10,
      end_date: "2024-10-04T00:30:00.000Z",
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe(1);
    expect(result.meta.total_records).toBe(1);
  });

  it("should_filter_readings_using_initial_date_and_final_date_aliases", async () => {
    const result = await service.execute({
      page: 1,
      limit: 10,
      initial_date: "2024-10-04T00:30:00.000Z",
      final_date: "2024-10-04T01:30:00.000Z",
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe(2);
    expect(result.meta.total_records).toBe(1);
  });

  it("should_return_empty_results_when_date_range_has_no_readings", async () => {
    const result = await service.execute({
      page: 1,
      limit: 10,
      start_date: "2025-01-01",
      end_date: "2025-01-02",
    });

    expect(result.data).toEqual([]);
    expect(result.meta).toEqual({
      total_records: 0,
      total_pages: 0,
      current_page: 1,
    });
  });

  it("should_throw_error_when_start_date_is_invalid", async () => {
    const act = () =>
      service.execute({
        page: 1,
        limit: 10,
        start_date: "invalid-date",
      });

    await expect(act).rejects.toThrow(ApplicationError);
  });

  it("should_throw_error_when_end_date_is_invalid", async () => {
    const act = () =>
      service.execute({
        page: 1,
        limit: 10,
        end_date: "2024-02-31",
      });

    await expect(act).rejects.toThrow(ApplicationError);
  });

  it("should_throw_error_when_start_date_exceeds_end_date", async () => {
    const act = () =>
      service.execute({
        page: 1,
        limit: 10,
        start_date: "2024-10-05",
        end_date: "2024-10-04",
      });

    await expect(act).rejects.toThrow(ApplicationError);
  });

  it("should_throw_error_when_initial_date_exceeds_final_date", async () => {
    const act = () =>
      service.execute({
        page: 1,
        limit: 10,
        initial_date: "2024-10-05",
        final_date: "2024-10-04",
      });

    await expect(act).rejects.toThrow(ApplicationError);
  });
});
