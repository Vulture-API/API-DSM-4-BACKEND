import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";

const base = { name: "Luminosidade", unit_of_measure: "lux" };

describe("sensor type calibration routes", () => {
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

  it("should_store_keep_and_remove_the_offset", async () => {
    const created = await post({
      ...base,
      factor: 3.6,
      gain: 0.0008,
      offset_value: -12.5,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      factor: 3.6,
      gain: 0.0008,
      offset_value: -12.5,
    });

    const kept = await put(base);
    expect(kept.json()).toMatchObject({ factor: 3.6, offset_value: -12.5 });

    const cleared = await put({ ...base, offset_value: null });
    expect(cleared.json()).toMatchObject({ factor: 3.6, offset_value: null });
  });

  it("should_return_the_offset_as_null_when_not_informed", async () => {
    const response = await post(base);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ offset_value: null });
  });

  it.each([
    ["a factor of zero", { factor: 0 }],
    ["a gain of zero", { gain: 0 }],
    ["an offset sent as text", { offset_value: "abc" }],
  ])("should_reject_%s_with_400", async (_case, calibration) => {
    const response = await post({ ...base, ...calibration });

    expect(response.statusCode).toBe(400);
  });

  it("should_reject_an_update_with_gain_zero_and_keep_the_type", async () => {
    await post({ ...base, gain: 2 });

    const response = await put({ ...base, gain: 0 });
    expect(response.statusCode).toBe(400);

    const current = await app.inject({
      method: "GET",
      url: "/api/sensor-types/1",
    });
    expect(current.json()).toMatchObject({ gain: 2 });
  });
});
