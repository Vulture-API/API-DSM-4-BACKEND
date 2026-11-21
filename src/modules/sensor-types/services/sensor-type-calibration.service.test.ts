import { describe, expect, it } from "vitest";

import { SensorTypeNotFoundError } from "@/modules/sensor-types/errors/sensor-type-not-found.error.js";
import { SensorTypeRepository } from "@/modules/sensor-types/repositories/sensor-type.repository.js";
import { InvalidCalibrationError } from "@/shared/errors/invalid-calibration.error.js";

import { CreateSensorTypeService } from "./create-sensor-type.service.js";
import { UpdateSensorTypeService } from "./update-sensor-type.service.js";

const base = { name: "Luminosidade", unit_of_measure: "lux" };

describe("sensor type calibration", () => {
  it("should_create_a_type_without_calibration_by_default", async () => {
    const created = await new CreateSensorTypeService(
      new SensorTypeRepository(),
    ).execute(base);

    expect(created).toMatchObject({
      factor: null,
      gain: null,
      offset_value: null,
    });
  });

  it("should_store_factor_gain_and_offset", async () => {
    const created = await new CreateSensorTypeService(
      new SensorTypeRepository(),
    ).execute({ ...base, factor: 3.6, gain: 0.0008, offset_value: -12.5 });

    expect(created).toMatchObject({
      factor: 3.6,
      gain: 0.0008,
      offset_value: -12.5,
    });
  });

  it.each([
    ["a factor of zero", { factor: 0 }],
    ["a gain of zero", { gain: 0 }],
    ["an offset that is not a number", { offset_value: Number.NaN }],
  ])("should_reject_the_creation_with_%s", async (_case, calibration) => {
    const repo = new SensorTypeRepository();

    await expect(
      new CreateSensorTypeService(repo).execute({ ...base, ...calibration }),
    ).rejects.toThrow(InvalidCalibrationError);
    expect(await repo.findAll()).toEqual([]);
  });

  it("should_keep_the_offset_when_the_update_omits_it_and_remove_it_with_null", async () => {
    const repo = new SensorTypeRepository();
    const created = await new CreateSensorTypeService(repo).execute({
      ...base,
      gain: 2,
      offset_value: 5,
    });
    const service = new UpdateSensorTypeService(repo);

    const kept = await service.execute(created.id, { ...base, gain: 4 });
    expect(kept).toMatchObject({ gain: 4, offset_value: 5 });

    const cleared = await service.execute(created.id, {
      ...base,
      offset_value: null,
    });
    expect(cleared).toMatchObject({ gain: 4, offset_value: null });
  });

  it("should_reject_an_update_with_factor_zero_and_keep_the_current_value", async () => {
    const repo = new SensorTypeRepository();
    const created = await new CreateSensorTypeService(repo).execute({
      ...base,
      factor: 3.6,
    });

    await expect(
      new UpdateSensorTypeService(repo).execute(created.id, {
        ...base,
        factor: 0,
      }),
    ).rejects.toThrow(InvalidCalibrationError);
    expect((await repo.findById(created.id))?.factor).toBe(3.6);
  });

  it("should_report_a_missing_type_before_validating_the_calibration", async () => {
    await expect(
      new UpdateSensorTypeService(new SensorTypeRepository()).execute(99, {
        ...base,
        gain: 0,
      }),
    ).rejects.toThrow(SensorTypeNotFoundError);
  });
});
