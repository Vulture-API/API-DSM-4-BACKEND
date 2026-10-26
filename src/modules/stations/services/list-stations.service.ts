import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";
import type { ListStationsQuery } from "@/modules/stations/schemas/station.schema.js";
import type { Station } from "@/modules/stations/types/station.type.js";
import {
  buildPaginationMeta,
  type Paginated,
} from "@/shared/types/paginated.type.js";

export class ListStationsService {
  constructor(private readonly stationRepository: StationRepository) {}

  async execute(query: ListStationsQuery): Promise<Paginated<Station>> {
    const { data, total_records: totalRecords } =
      await this.stationRepository.findMany({
        page: query.page,
        limit: query.limit,
        property_id: query.property_id,
      });

    return {
      data,
      meta: buildPaginationMeta(totalRecords, query.page, query.limit),
    };
  }
}
