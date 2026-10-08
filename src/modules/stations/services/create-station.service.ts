import { DuplicateMacAddressError } from "@/modules/stations/errors/duplicate-mac-address.error.js";
import { PropertyNotFoundError } from "@/modules/stations/errors/property-not-found.error.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";
import type { StationBodyInput } from "@/modules/stations/schemas/station.schema.js";
import type { Station } from "@/modules/stations/types/station.type.js";

export class CreateStationService {
  constructor(private readonly stationRepository: StationRepository) {}

  async execute(input: StationBodyInput): Promise<Station> {
    const propertyExists = await this.stationRepository.propertyExists(
      input.property_id,
    );

    if (!propertyExists) {
      throw new PropertyNotFoundError();
    }

    const existing = await this.stationRepository.findByMacAddress(
      input.mac_address,
    );

    if (existing) {
      throw new DuplicateMacAddressError();
    }

    return this.stationRepository.create(input);
  }
}
