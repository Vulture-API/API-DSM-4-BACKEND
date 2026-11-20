import { describe, expect, it } from "vitest";

import { SensorTypeRepository } from "@/modules/sensor-types/repositories/sensor-type.repository.js";
import { InvalidSensorLimitsError } from "@/modules/sensors/errors/invalid-sensor-limits.error.js";

import { CreateSensorTypeService } from "./create-sensor-type.service.js";
import { UpdateSensorTypeService } from "./update-sensor-type.service.js";

// SCRUM-635: limites físicos do tipo de sensor.
const base = { name: "Umidade", unit_of_measure: "%" };

describe("sensor type physical limits", () => {
  it("should_create_a_type_without_limits_by_default", async () => {
    const created = await new CreateSensorTypeService(
      new SensorTypeRepository(),
    ).execute(base);

    expect(created).toMatchObject({ min_value: null, max_value: null });
  });

  it("should_create_a_type_with_limits", async () => {
    const created = await new CreateSensorTypeService(
      new SensorTypeRepository(),
    ).execute({ ...base, min_value: 0, max_value: 100 });

    expect(created).toMatchObject({ min_value: 0, max_value: 100 });
  });

  it("should_accept_only_one_side_and_equal_limits", async () => {
    const service = new CreateSensorTypeService(new SensorTypeRepository());

    await expect(
      service.execute({ ...base, name: "Chuva", min_value: 0 }),
    ).resolves.toMatchObject({ min_value: 0, max_value: null });
    await expect(
      service.execute({ ...base, name: "Fixo", min_value: 5, max_value: 5 }),
    ).resolves.toMatchObject({ min_value: 5, max_value: 5 });
  });

  it("should_reject_a_minimum_above_the_maximum_on_creation", async () => {
    const repo = new SensorTypeRepository();

    await expect(
      new CreateSensorTypeService(repo).execute({
        ...base,
        min_value: 100,
        max_value: 0,
      }),
    ).rejects.toThrow(InvalidSensorLimitsError);
    expect(await repo.findAll()).toEqual([]);
  });

  it("should_edit_keep_and_remove_the_limits", async () => {
    const repo = new SensorTypeRepository();
    const created = await new CreateSensorTypeService(repo).execute({
      ...base,
      min_value: 0,
      max_value: 100,
    });
    const service = new UpdateSensorTypeService(repo);

    const kept = await service.execute(created.id, { ...base, max_value: 90 });
    expect(kept).toMatchObject({ min_value: 0, max_value: 90 });

    const cleared = await service.execute(created.id, {
      ...base,
      min_value: null,
      max_value: null,
    });
    expect(cleared).toMatchObject({ min_value: null, max_value: null });
  });

  it("should_reject_an_update_whose_resulting_range_is_empty", async () => {
    const repo = new SensorTypeRepository();
    const created = await new CreateSensorTypeService(repo).execute({
      ...base,
      min_value: 0,
      max_value: 100,
    });

    await expect(
      new UpdateSensorTypeService(repo).execute(created.id, {
        ...base,
        min_value: 150,
      }),
    ).rejects.toThrow(InvalidSensorLimitsError);
    expect(await repo.findById(created.id)).toMatchObject({
      min_value: 0,
      max_value: 100,
    });
  });
});
