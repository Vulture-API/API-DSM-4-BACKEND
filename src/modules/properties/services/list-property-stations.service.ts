import { PropertyNotFoundError } from "@/modules/properties/errors/property.errors.js";
import type { PropertyRepository } from "@/modules/properties/repositories/property.repository.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";
import type { Station } from "@/modules/stations/types/station.type.js";

export class ListPropertyStationsService {
  constructor(
    private readonly propertyRepository: PropertyRepository,
    private readonly stationRepository: StationRepository,
  ) {}

  async execute(propertyId: number): Promise<Station[]> {
    const property = await this.propertyRepository.findById(propertyId);
    if (!property) {
      throw new PropertyNotFoundError();
    }

    return this.stationRepository.findByPropertyId(propertyId);
  }
}
