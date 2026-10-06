import { DuplicateMacAddressError } from "@/modules/stations/errors/duplicate-mac-address.error.js";
import { PropertyNotFoundError } from "@/modules/stations/errors/property-not-found.error.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";
import type { StationBodyInput } from "@/modules/stations/schemas/station.schema.js";
import type { Station } from "@/modules/stations/types/station.type.js";

export class UpdateStationService {
  constructor(private readonly stationRepository: StationRepository) {}

  async execute(id: number, input: StationBodyInput): Promise<Station> {
    const station = await this.stationRepository.findById(id);

    if (!station) {
      throw new StationNotFoundError();
    }

    const propertyExists = await this.stationRepository.propertyExists(
      input.property_id,
    );

    if (!propertyExists) {
      throw new PropertyNotFoundError();
    }

    const stationWithMac = await this.stationRepository.findByMacAddress(
      input.mac_address,
    );

    if (stationWithMac && stationWithMac.id !== id) {
      throw new DuplicateMacAddressError();
    }

    const updated = await this.stationRepository.update(id, input);

    if (!updated) {
      throw new StationNotFoundError();
    }

    return updated;
  }
}
