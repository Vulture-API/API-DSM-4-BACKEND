import z from "zod";

import {
  OCCURRENCE_STATUSES,
  OCCURRENCE_TYPES,
} from "@/modules/occurrences/types/occurrence.type.js";
import { paginationQuerySchema } from "@/shared/schemas/pagination.schema.js";

// Data-hora com fuso obrigatório (ex.: 2026-10-14T08:00:00-03:00), sem ambiguidade.
const instant = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .optional();

export const listOccurrencesQuerySchema = paginationQuerySchema.extend({
  station_id: z.coerce.number().int().positive().optional(),
  sensor_id: z.coerce.number().int().positive().optional(),
  type: z.enum(OCCURRENCE_TYPES).optional(),
  status: z.enum(OCCURRENCE_STATUSES).optional(),
  from: instant,
  to: instant,
});

export const occurrenceIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type ListOccurrencesQuery = z.infer<typeof listOccurrencesQuerySchema>;
