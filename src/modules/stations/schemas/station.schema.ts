import z from "zod";

import { paginationQuerySchema } from "@/shared/schemas/pagination.schema.js";

// MAC no formato AA:BB:CC:DD:EE:FF ou AA-BB-CC-DD-EE-FF. O separador é
// capturado no primeiro par e reusado (\1) nos demais: formas misturadas como
// AA:BB-CC:DD-EE:FF são rejeitadas, em vez de normalizadas e gravadas.
const MAC_ADDRESS_REGEX =
  /^[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}$/;

export const stationBodySchema = z.object({
  property_id: z.coerce.number().int().positive(),
  mac_address: z
    .string()
    .trim()
    .max(50)
    .regex(MAC_ADDRESS_REGEX, "Invalid MAC address format")
    .transform((value) => value.toUpperCase().replaceAll("-", ":")),
  name: z.string().trim().min(3).max(100),
  latitude: z.coerce.number().min(-90).max(90).nullable().default(null),
  longitude: z.coerce.number().min(-180).max(180).nullable().default(null),
});

export const listStationsQuerySchema = paginationQuerySchema.extend({
  property_id: z.coerce.number().int().positive().optional(),
});

export const stationIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type StationBodyInput = z.infer<typeof stationBodySchema>;
export type ListStationsQuery = z.infer<typeof listStationsQuerySchema>;
export type StationIdParam = z.infer<typeof stationIdParamSchema>;
