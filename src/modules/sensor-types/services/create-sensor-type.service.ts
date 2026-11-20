import { SensorTypeConflictError } from "@/modules/sensor-types/errors/sensor-type-conflict.error.js";
import type { SensorTypeRepository } from "@/modules/sensor-types/repositories/sensor-type.repository.js";
import type { SensorTypeInput } from "@/modules/sensor-types/schemas/sensor-type-input.schema.js";
import type { SensorType } from "@/modules/sensor-types/types/sensor-type.type.js";
import { assertValidLimits } from "@/modules/sensors/errors/invalid-sensor-limits.error.js";
import { assertValidCalibration } from "@/shared/errors/invalid-calibration.error.js";

export class CreateSensorTypeService {
  constructor(private readonly sensorTypeRepository: SensorTypeRepository) {}

  async execute(input: SensorTypeInput): Promise<SensorType> {
    const existing = await this.sensorTypeRepository.findByName(input.name);
    if (existing) {
      throw new SensorTypeConflictError();
    }

    assertValidCalibration(input);
    assertValidLimits(input.min_value ?? null, input.max_value ?? null);

    return this.sensorTypeRepository.create(input);
  }
}
