import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";
import type { Station } from "@/modules/stations/types/station.type.js";

export class GetStationService {
  constructor(private readonly stationRepository: StationRepository) {}

  async execute(id: number): Promise<Station> {
    const station = await this.stationRepository.findById(id);

    if (!station) {
      throw new StationNotFoundError();
    }

    return station;
  }
}
