import type {
  CreateReadingInput,
  ListReadingsFilters,
  Reading,
} from "@/modules/readings/types/reading.type.js";

export type ReadingsQueryResult = {
  data: Reading[];
  total_records: number;
};

export interface ReadingRepository {
  create(data: CreateReadingInput): Promise<Reading>;
  createMany(data: CreateReadingInput[]): Promise<Reading[]>;
  findMany(filters: ListReadingsFilters): Promise<ReadingsQueryResult>;
  stationExists(stationId: number): Promise<boolean>;
}
