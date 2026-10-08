import { SensorConflictError } from "@/modules/sensors/errors/sensor-conflict.error.js";
import { SensorNotFoundError } from "@/modules/sensors/errors/sensor-not-found.error.js";
import { SensorReferenceNotFoundError } from "@/modules/sensors/errors/sensor-reference-not-found.error.js";
import type { SensorRepository } from "@/modules/sensors/repositories/sensor.repository.js";
import type { SensorInput } from "@/modules/sensors/schemas/sensor-input.schema.js";
import type { Sensor } from "@/modules/sensors/types/sensor.type.js";

export class UpdateSensorService {
  constructor(private readonly sensorRepository: SensorRepository) {}

  async execute(id: number, input: SensorInput): Promise<Sensor> {
    const existing = await this.sensorRepository.findById(id);
    if (!existing) {
      throw new SensorNotFoundError();
    }

    if (
      input.station_id !== existing.station_id &&
      !(await this.sensorRepository.stationExists(input.station_id))
    ) {
      throw new SensorReferenceNotFoundError("station");
    }
    if (
      input.sensor_type_id !== existing.sensor_type_id &&
      !(await this.sensorRepository.sensorTypeExists(input.sensor_type_id))
    ) {
      throw new SensorReferenceNotFoundError("sensor_type");
    }

    const targetStation = input.station_id ?? existing.station_id;
    const targetIdentifier =
      input.local_identifier ?? existing.local_identifier;

    const conflict = await this.sensorRepository.findByStationAndIdentifier(
      targetStation,
      targetIdentifier,
    );

    if (conflict && conflict.id !== id) {
      throw new SensorConflictError(
        "Sensor with this local identifier already exists on the specified station.",
      );
    }

    const updated = await this.sensorRepository.update(id, input);
    if (!updated) {
      throw new SensorNotFoundError();
    }
    return updated;
  }
}
