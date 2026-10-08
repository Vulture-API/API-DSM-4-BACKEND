import type { SensorTypeRepository } from "@/modules/sensor-types/repositories/sensor-type.repository.js";
import type { SensorType } from "@/modules/sensor-types/types/sensor-type.type.js";

export class ListSensorTypesService {
  constructor(private readonly sensorTypeRepository: SensorTypeRepository) {}

  async execute(): Promise<SensorType[]> {
    return this.sensorTypeRepository.findAll();
  }
}
