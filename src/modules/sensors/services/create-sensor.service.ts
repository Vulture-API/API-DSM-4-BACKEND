import { assertValidLimits } from "@/modules/sensors/errors/invalid-sensor-limits.error.js";
import { SensorConflictError } from "@/modules/sensors/errors/sensor-conflict.error.js";
import { SensorReferenceNotFoundError } from "@/modules/sensors/errors/sensor-reference-not-found.error.js";
import type { SensorRepository } from "@/modules/sensors/repositories/sensor.repository.js";
import type { SensorInput } from "@/modules/sensors/schemas/sensor-input.schema.js";
import type { Sensor } from "@/modules/sensors/types/sensor.type.js";

export class CreateSensorService {
  constructor(private readonly sensorRepository: SensorRepository) {}

  async execute(input: SensorInput): Promise<Sensor> {
    if (!(await this.sensorRepository.stationExists(input.station_id))) {
      throw new SensorReferenceNotFoundError("station");
    }
    if (!(await this.sensorRepository.sensorTypeExists(input.sensor_type_id))) {
      throw new SensorReferenceNotFoundError("sensor_type");
    }

    const existing = await this.sensorRepository.findByStationAndIdentifier(
      input.station_id,
      input.local_identifier,
    );

    if (existing) {
      throw new SensorConflictError(
        "Sensor with this local identifier already exists on the specified station.",
      );
    }

    const minValue = input.min_value ?? null;
    const maxValue = input.max_value ?? null;
    assertValidLimits(minValue, maxValue);

    return this.sensorRepository.create({
      station_id: input.station_id,
      sensor_type_id: input.sensor_type_id,
      local_identifier: input.local_identifier,
      operational_status: input.operational_status,
      min_value: minValue,
      max_value: maxValue,
    });
  }
}
