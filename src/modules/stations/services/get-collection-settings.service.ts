import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";
import type { StationCollectionSettings } from "@/modules/stations/types/station.type.js";
import {
  maxCollectionIntervalSeconds,
  MIN_COLLECTION_INTERVAL_SECONDS,
} from "@/modules/stations/utils/collection-interval.js";

export class GetCollectionSettingsService {
  constructor(
    private readonly stationRepository: StationRepository,
    private readonly offlineThresholdMinutes: number,
  ) {}

  async execute(id: number): Promise<StationCollectionSettings> {
    const current = await this.stationRepository.findCollectionInterval(id);

    if (!current) {
      throw new StationNotFoundError();
    }

    return {
      station_id: id,
      mac_address: current.mac_address,
      collection_interval_seconds: current.collection_interval_seconds,
      min_interval_seconds: MIN_COLLECTION_INTERVAL_SECONDS,
      max_interval_seconds: maxCollectionIntervalSeconds(
        this.offlineThresholdMinutes,
      ),
    };
  }
}
