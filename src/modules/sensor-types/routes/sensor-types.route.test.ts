import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";

describe("rotas de sensor-types (OpenAPI 1.3.0)", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("cria um tipo de sensor com sucesso (POST /sensor-types)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/sensor-types",
      payload: {
        name: "Temperature",
        unit_of_measure: "°C",
        factor: 1.0,
        gain: null,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: 1,
      name: "Temperature",
      unit_of_measure: "°C",
      factor: 1.0,
      gain: null,
    });
  });

  it("retorna conflito 409 ao tentar cadastrar nome duplicado", async () => {
    await app.inject({
      method: "POST",
      url: "/sensor-types",
      payload: {
        name: "Humidity",
        unit_of_measure: "%",
      },
    });

    const conflict = await app.inject({
      method: "POST",
      url: "/sensor-types",
      payload: {
        name: "Humidity",
        unit_of_measure: "%",
      },
    });

    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      code: 409,
    });
  });

  it("lista tipos de sensor cadastrados (GET /sensor-types)", async () => {
    await app.inject({
      method: "POST",
      url: "/sensor-types",
      payload: {
        name: "Wind Speed",
        unit_of_measure: "m/s",
        factor: 0.1,
        gain: 1.0,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/sensor-types",
    });

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].name).toBe("Wind Speed");
  });

  it("busca tipo de sensor por id (GET /sensor-types/:id)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sensor-types",
      payload: {
        name: "Pressure",
        unit_of_measure: "hPa",
      },
    });

    const id = created.json().id;

    const response = await app.inject({
      method: "GET",
      url: `/sensor-types/${id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(id);
  });

  it("atualiza tipo de sensor (PUT /sensor-types/:id)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sensor-types",
      payload: {
        name: "Rainfall",
        unit_of_measure: "mm",
      },
    });

    const id = created.json().id;

    const update = await app.inject({
      method: "PUT",
      url: `/sensor-types/${id}`,
      payload: {
        name: "Rainfall Index",
        unit_of_measure: "mm",
        factor: 0.2,
        gain: 1.0,
      },
    });

    expect(update.statusCode).toBe(200);
    expect(update.json().name).toBe("Rainfall Index");
    expect(update.json().gain).toBe(1.0);
  });

  it("exclui tipo de sensor (DELETE /sensor-types/:id)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/sensor-types",
      payload: {
        name: "Radiation",
        unit_of_measure: "W/m²",
      },
    });

    const id = created.json().id;

    const del = await app.inject({
      method: "DELETE",
      url: `/sensor-types/${id}`,
    });

    expect(del.statusCode).toBe(204);

    const get = await app.inject({
      method: "GET",
      url: `/sensor-types/${id}`,
    });

    expect(get.statusCode).toBe(404);
  });

  it("funciona sob a rota /v1/sensor-types", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/sensor-types",
    });

    expect(response.statusCode).toBe(200);
  });
});
