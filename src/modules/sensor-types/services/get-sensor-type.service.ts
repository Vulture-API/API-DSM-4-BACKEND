import { SensorTypeNotFoundError } from "@/modules/sensor-types/errors/sensor-type-not-found.error.js";
import type { SensorTypeRepository } from "@/modules/sensor-types/repositories/sensor-type.repository.js";
import type { SensorType } from "@/modules/sensor-types/types/sensor-type.type.js";

export class GetSensorTypeService {
  constructor(private readonly sensorTypeRepository: SensorTypeRepository) {}

  async execute(id: number): Promise<SensorType> {
    const found = await this.sensorTypeRepository.findById(id);
    if (!found) {
      throw new SensorTypeNotFoundError();
    }
    return found;
  }
}
