import { evaluateLimits } from "@/modules/occurrences/services/sensor-limits.js";
import type { ReadingRepository } from "@/modules/readings/repositories/reading.repository.js";
import type {
  CreateReadingInput,
  Reading,
} from "@/modules/readings/types/reading.type.js";
import { SensorNotFoundError } from "@/modules/sensors/errors/sensor-not-found.error.js";
import type { SensorRepository } from "@/modules/sensors/repositories/sensor.repository.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";

export class CreateReadingService {
  constructor(
    private readonly readingRepository: ReadingRepository,
    private readonly sensorRepository: SensorRepository,
    private readonly stationRepository?: StationRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: CreateReadingInput): Promise<Reading> {
    const sensor = await this.sensorRepository.findById(input.sensor_id);
    if (!sensor) {
      throw new SensorNotFoundError();
    }

    const violation = evaluateLimits(
      input.value,
      sensor.min_value,
      sensor.max_value,
    );

    const dataConsistent =
      violation !== null ? false : (input.data_consistent ?? true);

    const reading = await this.readingRepository.create({
      sensor_id: input.sensor_id,
      value: input.value,
      unix_time: input.unix_time,
      data_consistent: dataConsistent,
    });

    if (this.stationRepository) {
      await this.stationRepository.updateLastCommunication(
        sensor.station_id,
        this.clock(),
      );
    }

    return reading;
  }
}
