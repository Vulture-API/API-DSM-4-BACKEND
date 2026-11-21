import { ApplicationError } from "@/errors/application.error.js";
import type { ListReadingsFilters } from "@/modules/readings/types/reading.type.js";
import {
  isValidDateParameter,
  resolveTimeRange,
} from "@/modules/readings/utils/date-filter.js";

/** Valida e normaliza o período sem consultar infraestrutura ou alterar a entrada. */
export function normalizeReadingsFilters(
  input: ListReadingsFilters,
): ListReadingsFilters {
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

  return {
    ...input,
    start_unix_time: startUnixTime,
    end_unix_time: endUnixTime,
  };
}
