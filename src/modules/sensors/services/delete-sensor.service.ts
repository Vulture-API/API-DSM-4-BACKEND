import { SensorNotFoundError } from "@/modules/sensors/errors/sensor-not-found.error.js";
import type { SensorRepository } from "@/modules/sensors/repositories/sensor.repository.js";

export class DeleteSensorService {
  constructor(private readonly sensorRepository: SensorRepository) {}

  async execute(id: number): Promise<void> {
    const existing = await this.sensorRepository.findById(id);
    if (!existing) {
      throw new SensorNotFoundError();
    }
    await this.sensorRepository.delete(id);
  }
}
