import { InvalidCollectionIntervalError } from "@/modules/stations/errors/invalid-collection-interval.error.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";
import type { StationCollectionSettings } from "@/modules/stations/types/station.type.js";
import {
  isValidCollectionInterval,
  maxCollectionIntervalSeconds,
  MIN_COLLECTION_INTERVAL_SECONDS,
} from "@/modules/stations/utils/collection-interval.js";

export class UpdateCollectionSettingsService {
  constructor(
    private readonly stationRepository: StationRepository,
    private readonly offlineThresholdMinutes: number,
  ) {}

  async execute(
    id: number,
    collectionIntervalSeconds: number,
  ): Promise<StationCollectionSettings> {
    const max = maxCollectionIntervalSeconds(this.offlineThresholdMinutes);

    if (
      !isValidCollectionInterval(
        collectionIntervalSeconds,
        this.offlineThresholdMinutes,
      )
    ) {
      throw new InvalidCollectionIntervalError(
        MIN_COLLECTION_INTERVAL_SECONDS,
        max,
      );
    }

    const updated = await this.stationRepository.updateCollectionInterval(
      id,
      collectionIntervalSeconds,
    );

    if (!updated) {
      throw new StationNotFoundError();
    }

    return {
      station_id: id,
      mac_address: updated.mac_address,
      collection_interval_seconds: updated.collection_interval_seconds,
      min_interval_seconds: MIN_COLLECTION_INTERVAL_SECONDS,
      max_interval_seconds: max,
    };
  }
}
