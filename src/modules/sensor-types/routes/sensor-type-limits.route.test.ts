import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";

// SCRUM-635: limites físicos nas rotas de tipo de sensor.
const base = { name: "Umidade", unit_of_measure: "%" };

describe("sensor type physical limit routes", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const post = (payload: object) =>
    app.inject({ method: "POST", url: "/api/sensor-types", payload });
  const put = (payload: object) =>
    app.inject({ method: "PUT", url: "/api/sensor-types/1", payload });
  const get = () => app.inject({ method: "GET", url: "/api/sensor-types/1" });

  it("should_create_and_return_the_limits", async () => {
    const created = await post({ ...base, min_value: 0, max_value: 100 });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ min_value: 0, max_value: 100 });
    expect((await get()).json()).toMatchObject({
      min_value: 0,
      max_value: 100,
    });
    const list = await app.inject({ method: "GET", url: "/api/sensor-types" });
    expect(list.json()[0]).toMatchObject({ min_value: 0, max_value: 100 });
  });

  it("should_accept_empty_limits", async () => {
    const created = await post({ ...base, min_value: null, max_value: null });

    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ min_value: null, max_value: null });
  });

  it("should_edit_the_limits", async () => {
    await post({ ...base, min_value: 0, max_value: 100 });

    const updated = await put({ ...base, max_value: 90 });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ min_value: 0, max_value: 90 });
  });

  it.each([
    ["a minimum above the maximum", { min_value: 100, max_value: 0 }],
    ["a limit sent as text", { min_value: "zero" }],
  ])("should_reject_%s_with_400", async (_case, limits) => {
    const response = await post({ ...base, ...limits });

    expect(response.statusCode).toBe(400);
  });

  it("should_reject_an_update_that_leaves_the_minimum_above_the_maximum", async () => {
    await post({ ...base, min_value: 0, max_value: 100 });

    const response = await put({ ...base, min_value: 150 });
    expect(response.statusCode).toBe(400);
    expect((await get()).json()).toMatchObject({
      min_value: 0,
      max_value: 100,
    });
  });
});
