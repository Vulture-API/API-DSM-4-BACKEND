import z from "zod";

import { paginationQuerySchema } from "@/shared/schemas/pagination.schema.js";

export const listReadingsQuerySchema = paginationQuerySchema
  .extend({
    sensor_id: z.coerce.number().int().positive().optional(),
    station_id: z.coerce.number().int().positive().optional(),
    start_unix_time: z.coerce.number().int().nonnegative().optional(),
    end_unix_time: z.coerce.number().int().nonnegative().optional(),
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
  );

export type ListReadingsQuery = z.infer<typeof listReadingsQuerySchema>;
