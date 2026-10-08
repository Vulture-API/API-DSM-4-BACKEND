import { beforeEach, describe, expect, it } from "vitest";

import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import { InvalidPeriodError } from "@/modules/statistics/errors/invalid-period.error.js";
import { InMemoryStatisticsRepository } from "@/modules/statistics/repositories/statistics.repository.js";
import { GetStatisticsService } from "@/modules/statistics/services/get-statistics.service.js";
import type { SensorTypeStatistics } from "@/modules/statistics/types/statistics.type.js";

const now = new Date("2026-10-08T12:00:00.000Z");
const unix = (date: string) => Date.parse(date) / 1000;

const temperature: SensorTypeStatistics = {
  sensor_type_id: 3,
  sensor_type: "Temperatura",
  unit_of_measure: "°C",
  count: 120,
  avg: 22.4,
  min: 14.1,
  max: 31.8,
  stddev: 4.2,
  first_reading_at: new Date("2026-10-01T12:05:00.000Z"),
  last_reading_at: new Date("2026-10-08T11:55:00.000Z"),
};

describe("GetStatisticsService", () => {
  let repository: InMemoryStatisticsRepository;
  let service: GetStatisticsService;

  beforeEach(() => {
    repository = new InMemoryStatisticsRepository();
    repository.stationIds = [1];
    service = new GetStatisticsService(repository, () => now);
  });

  it("usa os últimos 7 dias quando o período não é informado", async () => {
    repository.rows = [
      temperature,
      { ...temperature, sensor_type_id: 4, count: 30 },
    ];

    const result = await service.execute({});

    expect(result.from).toEqual(new Date("2026-10-01T12:00:00.000Z"));
    expect(result.to).toEqual(now);
    expect(result.readings_total).toBe(150);
    expect(result.station_id).toBeNull();
    expect(repository.lastFilters).toEqual({
      station_id: undefined,
      property_id: undefined,
      from_unix: unix("2026-10-01T12:00:00.000Z"),
      to_unix: unix("2026-10-08T12:00:00.000Z"),
    });
  });

  it("aplica o período informado e os filtros", async () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-09-30T00:00:00.000Z");

    const result = await service.execute({
      station_id: 1,
      property_id: 2,
      from,
      to,
    });

    expect(result).toMatchObject({ from, to, station_id: 1, property_id: 2 });
    expect(repository.lastFilters).toMatchObject({
      station_id: 1,
      property_id: 2,
      from_unix: unix("2026-09-01T00:00:00.000Z"),
      to_unix: unix("2026-09-30T00:00:00.000Z"),
    });
  });

  it("aceita só o início e completa até agora", async () => {
    const result = await service.execute({
      from: new Date("2026-10-07T00:00:00.000Z"),
    });

    expect(result.to).toEqual(now);
  });

  it("recusa período invertido ou vazio", async () => {
    await expect(
      service.execute({
        from: new Date("2026-10-08T00:00:00.000Z"),
        to: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).rejects.toBeInstanceOf(InvalidPeriodError);
    await expect(
      service.execute({ from: now, to: now }),
    ).rejects.toBeInstanceOf(InvalidPeriodError);
  });

  it("recusa período maior que 366 dias", async () => {
    await expect(
      service.execute({
        from: new Date("2025-01-01T00:00:00.000Z"),
        to: new Date("2026-10-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow("366 days");
  });

  it("recusa estação inexistente com 404", async () => {
    await expect(service.execute({ station_id: 99 })).rejects.toBeInstanceOf(
      StationNotFoundError,
    );
  });

  it("devolve lista vazia sem leituras no período", async () => {
    const result = await service.execute({});

    expect(result.sensor_types).toEqual([]);
    expect(result.readings_total).toBe(0);
  });
});
