import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";
import { InMemoryStatisticsRepository } from "@/modules/statistics/repositories/statistics.repository.js";

describe("rotas de estatísticas", () => {
  const now = new Date("2026-10-08T12:00:00.000Z");
  let app: FastifyInstance;
  let statistics: InMemoryStatisticsRepository;

  beforeEach(async () => {
    statistics = new InMemoryStatisticsRepository();
    statistics.stationIds = [1];
    statistics.rows = [
      {
        sensor_type_id: 3,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        count: 2,
        avg: 21,
        min: 20,
        max: 22,
        stddev: 1.41,
        first_reading_at: new Date("2026-10-08T10:00:00.000Z"),
        last_reading_at: new Date("2026-10-08T11:00:00.000Z"),
      },
    ];
    app = buildApp({
      stationRepository: new InMemoryStationRepository(),
      statisticsRepository: statistics,
      clock: () => now,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /api/stations/statistics usa os últimos 7 dias", async () => {
    const response = await app.inject("/api/stations/statistics");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      from: "2026-10-01T12:00:00.000Z",
      to: "2026-10-08T12:00:00.000Z",
      readings_total: 2,
      sensor_types: [{ sensor_type: "Temperatura", avg: 21, stddev: 1.41 }],
    });
  });

  it("aceita período e propriedade", async () => {
    const response = await app.inject(
      "/api/stations/statistics?from=2026-09-01&to=2026-09-30T23:59:59Z&property_id=2",
    );

    expect(response.statusCode).toBe(200);
    expect(statistics.lastFilters).toMatchObject({ property_id: 2 });
    expect(response.json().from).toBe("2026-09-01T00:00:00.000Z");
  });

  it("devolve 400 para data inválida ou período inválido", async () => {
    const invalidDate = await app.inject("/api/stations/statistics?from=ontem");
    expect(invalidDate.statusCode).toBe(400);
    expect(invalidDate.json().code).toBe("VALIDATION_ERROR");

    const inverted = await app.inject(
      "/api/stations/statistics?from=2026-10-08&to=2026-10-01",
    );
    expect(inverted.statusCode).toBe(400);
    expect(inverted.json().code).toBe("INVALID_PERIOD");
  });

  it("GET /api/stations/:id/statistics filtra pela estação ou devolve 404", async () => {
    const ok = await app.inject("/api/stations/1/statistics");
    expect(ok.statusCode).toBe(200);
    expect(ok.json().station_id).toBe(1);
    expect(statistics.lastFilters?.station_id).toBe(1);

    const missing = await app.inject("/api/stations/99/statistics");
    expect(missing.statusCode).toBe(404);
  });
});
