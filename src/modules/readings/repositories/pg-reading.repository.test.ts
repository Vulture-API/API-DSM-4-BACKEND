import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PgReadingRepository } from "@/modules/readings/repositories/pg-reading.repository.js";

describe("PgReadingRepository", () => {
  const query = vi.fn();
  let repository: PgReadingRepository;

  beforeEach(() => {
    query.mockReset();
    repository = new PgReadingRepository({ query } as unknown as Pool);
  });

  it("should_return_true_when_station_exists", async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });

    const result = await repository.stationExists(1);

    expect(result).toBe(true);
    expect(query).toHaveBeenCalledWith(
      "SELECT 1 FROM stations WHERE id = $1",
      [1],
    );
  });

  it("should_return_false_when_station_does_not_exist", async () => {
    query.mockResolvedValueOnce({ rowCount: 0 });

    const result = await repository.stationExists(999);

    expect(result).toBe(false);
    expect(query).toHaveBeenCalledWith(
      "SELECT 1 FROM stations WHERE id = $1",
      [999],
    );
  });

  it("should_filter_by_station_id_in_find_many", async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          sensor_id: 10,
          value: 25.5,
          unix_time: 1728000000,
          data_consistent: true,
          created_at: new Date("2024-10-04T00:00:00.000Z"),
          total_records: "1",
        },
      ],
    });

    const result = await repository.findMany({
      page: 1,
      limit: 10,
      station_id: 2,
    });

    expect(result.total_records).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe(1);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      "r.sensor_id IN (SELECT s.id FROM sensors s WHERE s.station_id = $1)",
    );
    expect(values).toEqual([2, 10, 0]);
  });

  it("should_filter_by_station_id_and_period_jointly", async () => {
    query.mockResolvedValueOnce({
      rows: [],
    });

    const result = await repository.findMany({
      page: 1,
      limit: 10,
      station_id: 1,
      start_unix_time: 1000,
      end_unix_time: 2000,
    });

    expect(result.total_records).toBe(0);
    expect(result.data).toEqual([]);
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      "r.sensor_id IN (SELECT s.id FROM sensors s WHERE s.station_id = $1)",
    );
    expect(sql).toContain("r.unix_time >= $2");
    expect(sql).toContain("r.unix_time <= $3");
    expect(values).toEqual([1, 1000, 2000, 10, 0]);
  });
});
