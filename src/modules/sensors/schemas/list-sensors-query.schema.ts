import z from "zod";

export const listSensorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  station_id: z.coerce.number().int().positive().optional(),
});

export type ListSensorsQuery = z.infer<typeof listSensorsQuerySchema>;
