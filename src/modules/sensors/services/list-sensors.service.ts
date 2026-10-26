import type { SensorRepository } from "@/modules/sensors/repositories/sensor.repository.js";
import type { ListSensorsQuery } from "@/modules/sensors/schemas/list-sensors-query.schema.js";
import type { Sensor } from "@/modules/sensors/types/sensor.type.js";
import type { PaginatedResult } from "@/shared/schemas/pagination.schema.js";

export class ListSensorsService {
  constructor(private readonly sensorRepository: SensorRepository) {}

  async execute(query?: ListSensorsQuery): Promise<PaginatedResult<Sensor>> {
    return this.sensorRepository.findPaginated(query);
  }
}
