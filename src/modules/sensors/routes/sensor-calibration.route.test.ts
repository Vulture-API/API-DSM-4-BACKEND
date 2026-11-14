import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";

const base = { station_id: 1, sensor_type_id: 1, local_identifier: "lux" };

describe("sensor calibration routes", () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const post = (payload: object) =>
    app.inject({ method: "POST", url: "/api/sensors", payload });
  const put = (payload: object) =>
    app.inject({ method: "PUT", url: "/api/sensors/1", payload });

  it("should_return_the_calibration_fields_as_null_when_not_informed", async () => {
    const response = await post(base);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      gain: null,
      offset_value: null,
      model: null,
    });
  });

  it("should_store_keep_and_remove_the_calibration", async () => {
    const created = await post({
      ...base,
      gain: 0.0008,
      offset_value: -0.125,
      model: "  LDR GL5528  ",
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      gain: 0.0008,
      offset_value: -0.125,
      model: "LDR GL5528",
    });

    const kept = await put(base);
    expect(kept.json()).toMatchObject({ gain: 0.0008, offset_value: -0.125 });

    const cleared = await put({ ...base, gain: null, offset_value: null });
    expect(cleared.json()).toMatchObject({
      gain: null,
      offset_value: null,
      model: "LDR GL5528",
    });

    const listed = await app.inject({ method: "GET", url: "/api/sensors/1" });
    expect(listed.json()).toMatchObject({ gain: null, model: "LDR GL5528" });
  });

  it("should_reject_a_gain_of_zero_with_400", async () => {
    const response = await post({ ...base, gain: 0 });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("gain");
  });

  it.each([
    ["a gain sent as text", { gain: "2" }],
    ["an offset sent as text", { offset_value: "abc" }],
    ["an empty model", { model: "   " }],
    ["a model above 100 characters", { model: "x".repeat(101) }],
  ])("should_reject_%s_with_400", async (_case, calibration) => {
    const response = await post({ ...base, ...calibration });

    expect(response.statusCode).toBe(400);
  });

  it("should_reject_an_update_with_gain_zero_and_keep_the_sensor", async () => {
    await post({ ...base, gain: 2 });

    const response = await put({ ...base, gain: 0 });
    expect(response.statusCode).toBe(400);

    const current = await app.inject({ method: "GET", url: "/api/sensors/1" });
    expect(current.json()).toMatchObject({ gain: 2 });
  });
});
