import type {
  ListReadingsFilters,
  Reading,
} from "@/modules/readings/types/reading.type.js";

export type ReadingsQueryResult = {
  data: Reading[];
  total_records: number;
};

export interface ReadingRepository {
  findMany(filters: ListReadingsFilters): Promise<ReadingsQueryResult>;
  stationExists(stationId: number): Promise<boolean>;
}
