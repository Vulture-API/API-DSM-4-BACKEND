import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";

export class DeleteStationService {
  constructor(private readonly stationRepository: StationRepository) {}

  async execute(id: number): Promise<void> {
    const deleted = await this.stationRepository.delete(id);

    if (!deleted) {
      throw new StationNotFoundError();
    }
  }
}
