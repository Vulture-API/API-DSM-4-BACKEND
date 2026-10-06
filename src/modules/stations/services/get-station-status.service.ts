import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";
import type { StationStatus } from "@/modules/stations/types/station.type.js";

type Clock = () => Date;

export class GetStationStatusService {
  constructor(
    private readonly stationRepository: StationRepository,
    private readonly offlineThresholdMinutes: number,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async execute(id: number): Promise<StationStatus> {
    const station = await this.stationRepository.findById(id);

    if (!station) {
      throw new StationNotFoundError();
    }

    const checkedAt = this.clock();
    const offlineThresholdMilliseconds =
      this.offlineThresholdMinutes * 60 * 1000;
    const elapsedMilliseconds = station.last_communication_at
      ? checkedAt.getTime() - station.last_communication_at.getTime()
      : null;

    const status =
      elapsedMilliseconds !== null &&
      elapsedMilliseconds <= offlineThresholdMilliseconds
        ? "Online"
        : "Offline";

    return {
      station_id: station.id,
      status,
      last_communication_at: station.last_communication_at,
      checked_at: checkedAt,
      offline_threshold_minutes: this.offlineThresholdMinutes,
    };
  }
}
