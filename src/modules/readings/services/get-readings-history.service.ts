import type { ReadingRepository } from "@/modules/readings/repositories/reading.repository.js";
import type {
  ListReadingsFilters,
  Reading,
} from "@/modules/readings/types/reading.type.js";
import { normalizeReadingsFilters } from "@/modules/readings/utils/normalize-readings-filters.js";
import { StationNotFoundError } from "@/modules/stations/errors/station-not-found.error.js";
import {
  buildPaginationMeta,
  type Paginated,
} from "@/shared/types/paginated.type.js";

export class GetReadingsHistoryService {
  constructor(private readonly repository: ReadingRepository) {}

  async execute(input: ListReadingsFilters): Promise<Paginated<Reading>> {
    if (input.station_id !== undefined) {
      const stationExists = await this.repository.stationExists(
        input.station_id,
      );
      if (!stationExists) {
        throw new StationNotFoundError();
      }
    }

    const filters = normalizeReadingsFilters(input);
    const { data, total_records } = await this.repository.findMany(filters);

    return {
      data,
      meta: buildPaginationMeta(total_records, input.page, input.limit),
    };
  }
}
