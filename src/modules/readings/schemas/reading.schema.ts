import z from "zod";

import {
  isValidDateParameter,
  resolveTimeRange,
} from "@/modules/readings/utils/date-filter.js";
import { paginationQuerySchema } from "@/shared/schemas/pagination.schema.js";

const dateStringSchema = z.string().trim().refine(isValidDateParameter, {
  message: "Invalid date format. Expected YYYY-MM-DD or ISO 8601 datetime",
});

export const listReadingsQuerySchema = paginationQuerySchema
  .extend({
    sensor_id: z.coerce.number().int().positive().optional(),
    station_id: z.coerce.number().int().positive().optional(),
    start_unix_time: z.coerce.number().int().nonnegative().optional(),
    end_unix_time: z.coerce.number().int().nonnegative().optional(),
    start_date: dateStringSchema.optional(),
    end_date: dateStringSchema.optional(),
    initial_date: dateStringSchema.optional(),
    final_date: dateStringSchema.optional(),
  })
  .refine(
    (query) => {
      if (
        query.start_unix_time !== undefined &&
        query.end_unix_time !== undefined
      ) {
        return query.start_unix_time <= query.end_unix_time;
      }
      return true;
    },
    {
      message: "start_unix_time must be less than or equal to end_unix_time",
      path: ["start_unix_time"],
    },
  )
  .refine(
    (query) => {
      const { startUnixTime, endUnixTime } = resolveTimeRange(query);
      if (startUnixTime !== undefined && endUnixTime !== undefined) {
        return startUnixTime <= endUnixTime;
      }
      return true;
    },
    {
      message: "start_date must be less than or equal to end_date",
      path: ["start_date"],
    },
  );

export type ListReadingsQuery = z.infer<typeof listReadingsQuerySchema>;
