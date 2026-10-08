import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";

describe("rotas de sensors (OpenAPI 1.3.0)", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("vincula um novo sensor a uma estacao (POST /sensors)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/sensors",
      payload: {
        station_id: 1,
        sensor_type_id: 2,
        local_identifier: "DHT22_CANOPY_01",
        operational_status: true,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: 1,
      station_id: 1,
      sensor_type_id: 2,
      local_identifier: "DHT22_CANOPY_01",
      operational_status: true,
      created_at: expect.any(String),
    });
  });

  it("retorna 409 ao tentar cadastrar sensor com mesmo local_identifier na mesma estacao", async () => {
    await app.inject({
      method: "POST",
      url: "/sensors",
      payload: {
        station_id: 1,
        sensor_type_id: 1,
        local_identifier: "BMP280_01",
      },
    });

    const conflict = await app.inject({
      method: "POST",
      url: "/sensors",
      payload: {
        station_id: 1,
        sensor_type_id: 2,
        local_identifier: "BMP280_01",
      },
    });

    expect(conflict.statusCode).toBe(409);
  });

  it("lista sensores com formato paginado (GET /sensors)", async () => {
    await app.inject({
      method: "POST",
      url: "/sensors",
      payload: {
        station_id: 1,
        sensor_type_id: 1,
        local_identifier: "SENSOR_01",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/sensors?page=1&limit=10",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("meta");
    expect(body.meta).toMatchObject({
      total_records: 1,
      total_pages: 1,
      current_page: 1,
    });
  });

  it("filtra sensores por station_id", async () => {
    await app.inject({
      method: "POST",
      url: "/sensors",
      payload: {
        station_id: 1,
        sensor_type_id: 1,
        local_identifier: "SENSOR_A",
      },
    });

    await app.inject({
      method: "POST",
      url: "/sensors",
      payload: {
        station_id: 2,
        sensor_type_id: 1,
        local_identifier: "SENSOR_B",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/sensors?station_id=2",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].local_identifier).toBe("SENSOR_B");
  });

  it("busca sensor por id (GET /sensors/:id)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sensors",
      payload: {
        station_id: 1,
        sensor_type_id: 1,
        local_identifier: "ANEMO_01",
      },
    });

    const id = created.json().id;

    const response = await app.inject({
      method: "GET",
      url: `/sensors/${id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(id);
  });

  it("atualiza sensor existente (PUT /sensors/:id)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sensors",
      payload: {
        station_id: 1,
        sensor_type_id: 1,
        local_identifier: "PLUVIO_01",
        operational_status: true,
      },
    });

    const id = created.json().id;

    const update = await app.inject({
      method: "PUT",
      url: `/sensors/${id}`,
      payload: {
        station_id: 1,
        sensor_type_id: 1,
        local_identifier: "PLUVIO_01_CALIBRATED",
        operational_status: false,
      },
    });

    expect(update.statusCode).toBe(200);
    expect(update.json().local_identifier).toBe("PLUVIO_01_CALIBRATED");
    expect(update.json().operational_status).toBe(false);
  });

  it("exclui sensor por id (DELETE /sensors/:id)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sensors",
      payload: {
        station_id: 1,
        sensor_type_id: 1,
        local_identifier: "BARO_01",
      },
    });

    const id = created.json().id;

    const del = await app.inject({
      method: "DELETE",
      url: `/sensors/${id}`,
    });

    expect(del.statusCode).toBe(204);

    const get = await app.inject({
      method: "GET",
      url: `/sensors/${id}`,
    });

    expect(get.statusCode).toBe(404);
  });

  it("funciona sob a rota /v1/sensors", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/sensors",
    });

    expect(response.statusCode).toBe(200);
  });
});
