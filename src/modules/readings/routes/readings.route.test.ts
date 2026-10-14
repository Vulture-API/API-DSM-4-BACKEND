import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import { InMemoryReadingRepository } from "@/modules/readings/repositories/in-memory-reading.repository.js";

describe("rotas de histórico de leituras", () => {
  let app: FastifyInstance;
  let repository: InMemoryReadingRepository;

  beforeEach(async () => {
    repository = new InMemoryReadingRepository();
    repository.readings = [
      {
        id: 1,
        sensor_id: 10,
        station_id: 1,
        value: 22.4,
        unix_time: 1728000000,
        data_consistent: true,
        created_at: new Date("2024-10-04T00:00:00.000Z"),
      },
      {
        id: 2,
        sensor_id: 10,
        station_id: 1,
        value: 23.1,
        unix_time: 1728003600,
        data_consistent: true,
        created_at: new Date("2024-10-04T01:00:00.000Z"),
      },
      {
        id: 3,
        sensor_id: 20,
        station_id: 2,
        value: 70.0,
        unix_time: 1728007200,
        data_consistent: true,
        created_at: new Date("2024-10-04T02:00:00.000Z"),
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

  it("GET /api/readings retorna histórico paginado com formato padronizado", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(3);
    expect(body.data[0].id).toBe(3);
    expect(body.meta).toEqual({
      total_records: 3,
      total_pages: 1,
      current_page: 1,
    });
  });

  it("GET /readings rota alias funciona identicamente", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/readings",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(3);
    expect(body.meta.total_records).toBe(3);
  });

  it("GET /api/readings filtra por sensor_id", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings?sensor_id=10",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(2);
    expect(
      body.data.every((r: { sensor_id: number }) => r.sensor_id === 10),
    ).toBe(true);
    expect(body.meta.total_records).toBe(2);
  });

  it("GET /api/readings filtra por station_id", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings?station_id=2",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(3);
  });

  it("GET /api/readings filtra por período unix_time", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings?start_unix_time=1728001000&end_unix_time=1728005000",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(2);
  });

  it("GET /api/readings suporta paginação customizada", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings?page=2&limit=2",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(1);
    expect(body.meta).toEqual({
      total_records: 3,
      total_pages: 2,
      current_page: 2,
    });
  });

  it("GET /api/readings trata cenário sem registros retornando lista vazia", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings?sensor_id=9999",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toEqual([]);
    expect(body.meta).toEqual({
      total_records: 0,
      total_pages: 0,
      current_page: 1,
    });
  });

  it("GET /api/readings retorna 400 quando start_unix_time for maior que end_unix_time", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings?start_unix_time=5000&end_unix_time=1000",
    });

    expect(response.statusCode).toBe(400);
  });

  it("GET /api/readings retorna 400 quando parâmetros de paginação forem inválidos", async () => {
    const invalidPage = await app.inject({
      method: "GET",
      url: "/api/readings?page=0",
    });
    expect(invalidPage.statusCode).toBe(400);

    const invalidLimit = await app.inject({
      method: "GET",
      url: "/api/readings?limit=200",
    });
    expect(invalidLimit.statusCode).toBe(400);
  });
});
