import { ApplicationError } from "@/errors/application.error.js";
import type { ReadingRepository } from "@/modules/readings/repositories/reading.repository.js";
import type {
  ListReadingsFilters,
  Reading,
} from "@/modules/readings/types/reading.type.js";
import {
  isValidDateParameter,
  resolveTimeRange,
} from "@/modules/readings/utils/date-filter.js";
import {
  buildPaginationMeta,
  type Paginated,
} from "@/shared/types/paginated.type.js";

export class GetReadingsHistoryService {
  constructor(private readonly repository: ReadingRepository) {}

  async execute(input: ListReadingsFilters): Promise<Paginated<Reading>> {
    const rawStartDate = input.start_date ?? input.initial_date;
    const rawEndDate = input.end_date ?? input.final_date;

    if (rawStartDate !== undefined && !isValidDateParameter(rawStartDate)) {
      throw new ApplicationError(
        400,
        "INVALID_DATE",
        "Invalid start date format. Expected YYYY-MM-DD or ISO 8601 datetime",
      );
    }

    if (rawEndDate !== undefined && !isValidDateParameter(rawEndDate)) {
      throw new ApplicationError(
        400,
        "INVALID_DATE",
        "Invalid end date format. Expected YYYY-MM-DD or ISO 8601 datetime",
      );
    }

    const { startUnixTime, endUnixTime } = resolveTimeRange(input);

    if (
      startUnixTime !== undefined &&
      endUnixTime !== undefined &&
      startUnixTime > endUnixTime
    ) {
      throw new ApplicationError(
        400,
        "INVALID_PERIOD",
        "start period must be less than or equal to end period",
      );
    }

    const { data, total_records } = await this.repository.findMany({
      ...input,
      start_unix_time: startUnixTime,
      end_unix_time: endUnixTime,
    });

    return {
      data,
      meta: buildPaginationMeta(total_records, input.page, input.limit),
    };
  }
}
