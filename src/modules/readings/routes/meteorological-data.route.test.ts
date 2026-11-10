import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "@/app.js";
import { InMemoryReadingRepository } from "@/modules/readings/repositories/in-memory-reading.repository.js";

describe("consulta de dados meteorológicos da US16", () => {
  let app: FastifyInstance;
  let repository: InMemoryReadingRepository;

  beforeEach(async () => {
    repository = new InMemoryReadingRepository();
    repository.knownStationIds = new Set([1, 2, 3]);
    repository.readings = [
      {
        id: 1,
        station_id: 1,
        sensor_id: 10,
        value: 0,
        unix_time: 1728000000,
        data_consistent: true,
        created_at: new Date("2024-10-04T00:00:00Z"),
      },
      {
        id: 2,
        station_id: 1,
        sensor_id: 11,
        value: 25,
        unix_time: 1728003600,
        data_consistent: false,
        created_at: new Date("2024-10-04T01:00:00Z"),
      },
      {
        id: 3,
        station_id: 2,
        sensor_id: 20,
        value: 60,
        unix_time: 1728007200,
        data_consistent: true,
        created_at: new Date("2024-10-04T02:00:00Z"),
      },
    ];
    app = buildApp({
      readingRepository: repository,
      accessControlEnabled: false,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    ["", [3, 2, 1]],
    ["?station_id=1", [2, 1]],
    ["?sensor_id=10", [1]],
    ["?start_date=2024-10-04T01:00:00Z&end_date=2024-10-04T02:00:00Z", [3, 2]],
    [
      "?station_id=1&start_date=2024-10-04T01:00:00Z&end_date=2024-10-04T02:00:00Z",
      [2],
    ],
    ["?initial_date=2024-10-04&final_date=2024-10-04&station_id=1", [2, 1]],
    [
      "?start_unix_time=1728000000&end_unix_time=1728003600&station_id=1",
      [2, 1],
    ],
    ["?start_date=2024-10-04T02:00:00", [3]],
    ["?end_date=2024-10-04T00:00:00Z", [1]],
    ["?start_unix_time=1728000000&end_date=2024-10-04T00:00:00Z", [1]],
    ["?page=2&limit=2", [1]],
    ["?station_id=3", []],
    ["?start_date=2025-01-01", []],
  ])(
    "reutiliza o histórico paginado e seus filtros: %s",
    async (query, ids) => {
      const response = await app.inject({
        url: `/api/meteorological-data${query}`,
      });
      const legacy = await app.inject({ url: `/api/readings${query}` });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(legacy.json());
      expect(response.json().data.map((r: { id: number }) => r.id)).toEqual(
        ids,
      );
    },
  );

  it("mantém os campos, a consistência e os padrões de paginação", async () => {
    const list = vi.spyOn(repository, "findMany");
    const response = await app.inject({ url: "/api/meteorological-data" });
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    );
    expect(response.json().meta).toEqual({
      total_records: 3,
      total_pages: 1,
      current_page: 1,
    });
    expect(response.json().data[1]).toEqual({
      id: 2,
      sensor_id: 11,
      value: 25,
      unix_time: 1728003600,
      data_consistent: false,
      created_at: "2024-10-04T01:00:00.000Z",
    });
  });

  it.each([
    "?start_date=inválido",
    "?end_date=2024-02-31",
    "?station_id=0",
    "?start_date=2024-10-05&end_date=2024-10-04",
    "?start_unix_time=2&end_unix_time=1",
    "?start_unix_time=1728007200&end_date=2024-10-04T00:00:00Z",
    "?page=0",
    "?limit=101",
    "?start_unix_time=-1",
  ])(
    "recusa parâmetros inválidos antes de consultar o repositório: %s",
    async (query) => {
      const list = vi.spyOn(repository, "findMany");
      const response = await app.inject({
        url: `/api/meteorological-data${query}`,
      });
      expect(response.statusCode).toBe(400);
      expect(list).not.toHaveBeenCalled();
    },
  );

  it("retorna 404 para estação inexistente", async () => {
    const response = await app.inject({
      url: "/api/meteorological-data?station_id=999",
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("STATION_NOT_FOUND");
  });
});
