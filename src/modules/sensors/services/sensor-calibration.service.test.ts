import { describe, expect, it } from "vitest";

import { SensorRepository } from "@/modules/sensors/repositories/sensor.repository.js";
import { InvalidCalibrationError } from "@/shared/errors/invalid-calibration.error.js";

import { CreateSensorService } from "./create-sensor.service.js";
import { UpdateSensorService } from "./update-sensor.service.js";

const base = {
  station_id: 1,
  sensor_type_id: 1,
  local_identifier: "lux",
  operational_status: true,
};

describe("sensor calibration", () => {
  it("should_create_a_sensor_without_calibration_by_default", async () => {
    const created = await new CreateSensorService(
      new SensorRepository(),
    ).execute(base);

    expect(created).toMatchObject({
      gain: null,
      offset_value: null,
      model: null,
    });
  });

  it("should_store_gain_offset_and_model_on_creation", async () => {
    const created = await new CreateSensorService(
      new SensorRepository(),
    ).execute({
      ...base,
      gain: 0.000805860805,
      offset_value: -0.125,
      model: "LDR GL5528",
    });

    expect(created).toMatchObject({
      gain: 0.000805860805,
      offset_value: -0.125,
      model: "LDR GL5528",
    });
  });

  it("should_accept_an_offset_of_zero", async () => {
    const created = await new CreateSensorService(
      new SensorRepository(),
    ).execute({ ...base, offset_value: 0 });

    expect(created.offset_value).toBe(0);
  });

  it.each([
    ["a gain of zero", { gain: 0 }],
    ["a gain that is not a number", { gain: Number.NaN }],
    ["an infinite offset", { offset_value: Number.POSITIVE_INFINITY }],
  ])("should_reject_the_creation_with_%s", async (_case, calibration) => {
    const repo = new SensorRepository();

    await expect(
      new CreateSensorService(repo).execute({ ...base, ...calibration }),
    ).rejects.toThrow(InvalidCalibrationError);
    expect((await repo.findPaginated()).meta.total_records).toBe(0);
  });

  it("should_keep_the_calibration_when_the_update_omits_it", async () => {
    const repo = new SensorRepository();
    const created = await new CreateSensorService(repo).execute({
      ...base,
      gain: 2,
      offset_value: 5,
      model: "BH1750",
    });

    const updated = await new UpdateSensorService(repo).execute(created.id, {
      ...base,
      local_identifier: "lux2",
    });

    expect(updated).toMatchObject({
      local_identifier: "lux2",
      gain: 2,
      offset_value: 5,
      model: "BH1750",
    });
  });

  it("should_change_one_field_and_remove_another_with_null", async () => {
    const repo = new SensorRepository();
    const created = await new CreateSensorService(repo).execute({
      ...base,
      gain: 2,
      offset_value: 5,
      model: "BH1750",
    });

    const updated = await new UpdateSensorService(repo).execute(created.id, {
      ...base,
      gain: 3,
      offset_value: null,
      model: null,
    });

    expect(updated).toMatchObject({ gain: 3, offset_value: null, model: null });
  });

  it("should_reject_an_update_with_gain_zero_and_keep_the_current_value", async () => {
    const repo = new SensorRepository();
    const created = await new CreateSensorService(repo).execute({
      ...base,
      gain: 2,
    });

    await expect(
      new UpdateSensorService(repo).execute(created.id, { ...base, gain: 0 }),
    ).rejects.toThrow(InvalidCalibrationError);
    expect((await repo.findById(created.id))?.gain).toBe(2);
  });
});
