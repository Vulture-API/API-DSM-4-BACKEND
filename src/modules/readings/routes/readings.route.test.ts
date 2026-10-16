import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";
import { InMemoryReadingRepository } from "@/modules/readings/repositories/in-memory-reading.repository.js";
import { InMemorySensorRepository } from "@/modules/sensors/repositories/sensor.repository.js";
import { InMemoryStationRepository } from "@/modules/stations/repositories/in-memory-station.repository.js";

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

    const sensorRepo = new InMemorySensorRepository();
    await sensorRepo.create({
      station_id: 1,
      sensor_type_id: 1,
      local_identifier: "S10",
      operational_status: true,
      min_value: -10,
      max_value: 50,
    });
    sensorRepo["sensors"][0]!.id = 10;

    await sensorRepo.create({
      station_id: 2,
      sensor_type_id: 2,
      local_identifier: "S20",
      operational_status: true,
      min_value: 0,
      max_value: 100,
    });
    sensorRepo["sensors"][1]!.id = 20;

    const stationRepo = new InMemoryStationRepository();
    await stationRepo.create({
      property_id: 1,
      mac_address: "AA:BB:CC:DD:EE:01",
      name: "Estação 1",
      latitude: -23.5,
      longitude: -46.6,
    });
    await stationRepo.create({
      property_id: 1,
      mac_address: "AA:BB:CC:DD:EE:02",
      name: "Estação 2",
      latitude: -23.5,
      longitude: -46.6,
    });

    app = buildApp({
      readingRepository: repository,
      sensorRepository: sensorRepo,
      stationRepository: stationRepo,
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

  it("GET /api/readings retorna 404 quando station_id não existe", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings?station_id=999",
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.code).toBe("STATION_NOT_FOUND");
    expect(body.message).toBe("Station not found.");
  });

  it("GET /api/readings retorna 200 com lista vazia quando estação existe mas não tem leituras", async () => {
    repository.knownStationIds = new Set([1, 2, 3]);

    const response = await app.inject({
      method: "GET",
      url: "/api/readings?station_id=3",
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

  it("GET /api/readings filtra por station_id em conjunto com período", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings?station_id=1&start_date=2024-10-04T00:30:00.000Z&end_date=2024-10-04T01:30:00.000Z",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(2);
    expect(body.meta.total_records).toBe(1);
  });

  it("GET /readings e GET /api/v1/readings filtram por station_id identicamente", async () => {
    const aliasResponse = await app.inject({
      method: "GET",
      url: "/readings?station_id=2",
    });
    expect(aliasResponse.statusCode).toBe(200);
    expect(aliasResponse.json().data).toHaveLength(1);

    const v1Response = await app.inject({
      method: "GET",
      url: "/api/v1/readings?station_id=2",
    });
    expect(v1Response.statusCode).toBe(200);
    expect(v1Response.json().data).toHaveLength(1);
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

  it("GET /api/readings filtra por período usando start_date e end_date no formato data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings?start_date=2024-10-04&end_date=2024-10-04",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(3);
    expect(body.meta.total_records).toBe(3);
  });

  it("GET /api/readings filtra por período usando ISO datetime", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings?start_date=2024-10-04T00:30:00.000Z&end_date=2024-10-04T01:30:00.000Z",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(2);
    expect(body.meta.total_records).toBe(1);
  });

  it("GET /api/readings filtra usando aliases initial_date e final_date", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings?initial_date=2024-10-04T00:30:00.000Z&final_date=2024-10-04T01:30:00.000Z",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(2);
  });

  it("GET /api/readings retorna resposta válida vazia quando período não contiver leituras", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings?start_date=2025-01-01&end_date=2025-01-02",
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

  it("GET /api/readings retorna 400 quando start_date for string inválida", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings?start_date=not-a-valid-date",
    });

    expect(response.statusCode).toBe(400);
  });

  it("GET /api/readings retorna 400 quando data tiver dia inexistente no calendário", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings?end_date=2024-02-31",
    });

    expect(response.statusCode).toBe(400);
  });

  it("GET /api/readings retorna 400 quando start_date for maior que end_date", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/readings?start_date=2024-10-05&end_date=2024-10-04",
    });

    expect(response.statusCode).toBe(400);
  });

  it("GET /readings e GET /api/v1/readings filtram por período identicamente", async () => {
    const aliasResponse = await app.inject({
      method: "GET",
      url: "/readings?start_date=2024-10-04T00:30:00.000Z&end_date=2024-10-04T01:30:00.000Z",
    });
    expect(aliasResponse.statusCode).toBe(200);
    expect(aliasResponse.json().data).toHaveLength(1);

    const v1Response = await app.inject({
      method: "GET",
      url: "/api/v1/readings?start_date=2024-10-04T00:30:00.000Z&end_date=2024-10-04T01:30:00.000Z",
    });
    expect(v1Response.statusCode).toBe(200);
    expect(v1Response.json().data).toHaveLength(1);
  });

  it("POST /readings registra uma nova leitura com sucesso", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/readings",
      payload: {
        sensor_id: 10,
        value: 26.8,
        unix_time: 1728010000,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: expect.any(Number),
      sensor_id: 10,
      value: 26.8,
      unix_time: 1728010000,
      data_consistent: true,
    });
  });

  it("POST /api/readings registra nova leitura com formato alias", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/readings",
      payload: {
        sensor_id: 10,
        value: 28.1,
        unix_time: 1728011000,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().value).toBe(28.1);
  });

  it("POST /readings retorna 400 quando payload for invalido", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/readings",
      payload: {
        sensor_id: "invalid",
        value: "not-a-number",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("POST /readings retorna 404 quando sensor_id nao existir", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/readings",
      payload: {
        sensor_id: 9999,
        value: 20.0,
        unix_time: 1728010000,
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it("POST /api/readings/station-data ingere telemetria enviada pela estacao", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/readings/station-data",
      payload: {
        station_id: 1,
        unix_time: 1728010000,
        readings: [
          { sensor_id: 10, value: 24.5 },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].value).toBe(24.5);
  });

  it("POST /api/readings/stations/:id/data ingere telemetria parametrizada por id da estacao", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/readings/stations/1/data",
      payload: {
        unix_time: 1728010000,
        readings: [
          { sensor_id: 10, value: 22.0 },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].sensor_id).toBe(10);
  });

  it("POST /api/readings/stations/:id/data retorna 404 quando estacao nao existir", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/readings/stations/999/data",
      payload: {
        unix_time: 1728010000,
        readings: [
          { sensor_id: 10, value: 22.0 },
        ],
      },
    });

    expect(response.statusCode).toBe(404);
  });
});
