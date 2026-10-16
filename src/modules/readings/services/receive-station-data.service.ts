import { evaluateLimits } from "@/modules/occurrences/services/sensor-limits.js";
import type { ReadingRepository } from "@/modules/readings/repositories/reading.repository.js";
import type {
  CreateReadingInput,
  IngestStationDataInput,
  Reading,
} from "@/modules/readings/types/reading.type.js";
import type { SensorRepository } from "@/modules/sensors/repositories/sensor.repository.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";
import type { Station } from "@/modules/stations/types/station.type.js";

export class ReceiveStationDataService {
  constructor(
    private readonly readingRepository: ReadingRepository,
    private readonly sensorRepository: SensorRepository,
    private readonly stationRepository: StationRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute(input: IngestStationDataInput): Promise<Reading[]> {
    let station: Station | null = null;

    if (input.station_id !== undefined) {
      station = await this.stationRepository.findById(input.station_id);
    } else if (input.mac_address) {
      station = await this.stationRepository.findByMacAddress(input.mac_address);
    }

    if (!station) {
      throw new StationNotFoundError();
    }

    const defaultUnixTime =
      input.unix_time ?? Math.floor(this.clock().getTime() / 1000);

    const preparedReadings: CreateReadingInput[] = [];

    for (const item of input.readings) {
      let sensor = null;
      if (item.sensor_id !== undefined) {
        sensor = await this.sensorRepository.findById(item.sensor_id);
      } else if (item.local_identifier) {
        sensor = await this.sensorRepository.findByStationAndIdentifier(
          station.id,
          item.local_identifier,
        );
      }

      if (!sensor || sensor.station_id !== station.id) {
        continue;
      }

      const violation = evaluateLimits(
        item.value,
        sensor.min_value,
        sensor.max_value,
      );

      const dataConsistent =
        violation !== null ? false : (item.data_consistent ?? true);

      preparedReadings.push({
        sensor_id: sensor.id,
        value: item.value,
        unix_time: item.unix_time ?? defaultUnixTime,
        data_consistent: dataConsistent,
      });
    }

    if (preparedReadings.length === 0) {
      await this.stationRepository.updateLastCommunication(
        station.id,
        this.clock(),
      );
      return [];
    }

    const created = await this.readingRepository.createMany(preparedReadings);

    await this.stationRepository.updateLastCommunication(
      station.id,
      this.clock(),
    );

    return created;
  }
}
