import { SensorNotFoundError } from "@/modules/sensors/errors/sensor-not-found.error.js";
import type { SensorRepository } from "@/modules/sensors/repositories/sensor.repository.js";
import type { Sensor } from "@/modules/sensors/types/sensor.type.js";

export class GetSensorService {
  constructor(private readonly sensorRepository: SensorRepository) {}

  async execute(id: number): Promise<Sensor> {
    const found = await this.sensorRepository.findById(id);
    if (!found) {
      throw new SensorNotFoundError();
    }
    return found;
  }
}
