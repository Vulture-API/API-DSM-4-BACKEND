import { ApplicationError } from "@/errors/application.error.js";
import type { ReadingRepository } from "@/modules/readings/repositories/reading.repository.js";
import type {
  ListReadingsFilters,
  Reading,
} from "@/modules/readings/types/reading.type.js";
import {
  buildPaginationMeta,
  type Paginated,
} from "@/shared/types/paginated.type.js";

export class GetReadingsHistoryService {
  constructor(private readonly repository: ReadingRepository) {}

  async execute(input: ListReadingsFilters): Promise<Paginated<Reading>> {
    if (
      input.start_unix_time !== undefined &&
      input.end_unix_time !== undefined &&
      input.start_unix_time > input.end_unix_time
    ) {
      throw new ApplicationError(
        400,
        "INVALID_PERIOD",
        "start_unix_time must be less than or equal to end_unix_time",
      );
    }

    const { data, total_records } = await this.repository.findMany(input);

    return {
      data,
      meta: buildPaginationMeta(total_records, input.page, input.limit),
    };
  }
}
