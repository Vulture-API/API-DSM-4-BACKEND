import { PropertyNotFoundError } from "@/modules/properties/errors/property.errors.js";
import type { PropertyRepository } from "@/modules/properties/repositories/property.repository.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";
import type { Station } from "@/modules/stations/types/station.type.js";

export class AssociatePropertyStationsService {
  constructor(
    private readonly propertyRepository: PropertyRepository,
    private readonly stationRepository: StationRepository,
  ) {}

  async execute(propertyId: number, stationIds: number[]): Promise<Station[]> {
    const property = await this.propertyRepository.findById(propertyId);
    if (!property) {
      throw new PropertyNotFoundError();
    }

    for (const stationId of stationIds) {
      const station = await this.stationRepository.findById(stationId);
      if (!station) {
        throw new StationNotFoundError();
      }
    }

    const updatedStations: Station[] = [];
    for (const stationId of stationIds) {
      const updated = await this.stationRepository.updatePropertyId(
        stationId,
        propertyId,
      );
      if (updated) {
        updatedStations.push(updated);
      }
    }

    return updatedStations;
  }
}
