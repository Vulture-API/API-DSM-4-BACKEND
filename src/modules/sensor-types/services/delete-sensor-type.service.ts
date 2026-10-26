import { SensorTypeConflictError } from "@/modules/sensor-types/errors/sensor-type-conflict.error.js";
import { SensorTypeNotFoundError } from "@/modules/sensor-types/errors/sensor-type-not-found.error.js";
import type { SensorTypeRepository } from "@/modules/sensor-types/repositories/sensor-type.repository.js";

export class DeleteSensorTypeService {
  constructor(
    private readonly sensorTypeRepository: SensorTypeRepository,
    private readonly checkSensorAssociation?: (
      sensorTypeId: number,
    ) => Promise<boolean>,
  ) {}

  async execute(id: number): Promise<void> {
    const existing = await this.sensorTypeRepository.findById(id);
    if (!existing) {
      throw new SensorTypeNotFoundError();
    }

    if (this.checkSensorAssociation) {
      const hasAssociatedSensors = await this.checkSensorAssociation(id);
      if (hasAssociatedSensors) {
        throw new SensorTypeConflictError(
          "Cannot delete sensor type associated with existing sensors (ON DELETE RESTRICT).",
        );
      }
    }

    await this.sensorTypeRepository.delete(id);
  }
}
