import { SensorTypeConflictError } from "@/modules/sensor-types/errors/sensor-type-conflict.error.js";
import { SensorTypeNotFoundError } from "@/modules/sensor-types/errors/sensor-type-not-found.error.js";
import type { SensorTypeRepository } from "@/modules/sensor-types/repositories/sensor-type.repository.js";
import type { SensorTypeInput } from "@/modules/sensor-types/schemas/sensor-type-input.schema.js";
import type { SensorType } from "@/modules/sensor-types/types/sensor-type.type.js";

export class UpdateSensorTypeService {
  constructor(private readonly sensorTypeRepository: SensorTypeRepository) {}

  async execute(id: number, input: SensorTypeInput): Promise<SensorType> {
    const existing = await this.sensorTypeRepository.findById(id);
    if (!existing) {
      throw new SensorTypeNotFoundError();
    }

    if (input.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await this.sensorTypeRepository.findByName(input.name);
      if (duplicate && duplicate.id !== id) {
        throw new SensorTypeConflictError();
      }
    }

    const updated = await this.sensorTypeRepository.update(id, input);
    if (!updated) {
      throw new SensorTypeNotFoundError();
    }
    return updated;
  }
}
