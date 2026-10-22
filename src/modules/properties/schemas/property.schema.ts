import z from "zod";

export const propertyBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  owner_user_id: z.coerce.number().int().positive(),
  location: z
    .string()
    .trim()
    .max(255)
    .nullish()
    .transform((value) => (value && value.length > 0 ? value : null)),
});

export type PropertyBodyInput = z.infer<typeof propertyBodySchema>;

export const propertyIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const updatePropertyBodySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100).optional(),
    owner_user_id: z.coerce.number().int().positive().optional(),
    location: z
      .string()
      .trim()
      .max(255)
      .nullish()
      .transform((value) => (value && value.length > 0 ? value : null))
      .optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.owner_user_id !== undefined ||
      data.location !== undefined,
    { message: "At least one field must be provided for update." },
  );

export type PropertyIdParam = z.infer<typeof propertyIdParamSchema>;
export type UpdatePropertyBodyInput = z.infer<typeof updatePropertyBodySchema>;

export const associateStationsBodySchema = z
  .object({
    station_id: z.coerce.number().int().positive().optional(),
    station_ids: z.array(z.coerce.number().int().positive()).optional(),
  })
  .refine(
    (data) =>
      data.station_id !== undefined ||
      (Array.isArray(data.station_ids) && data.station_ids.length > 0),
    {
      message:
        "At least one of station_id or a non-empty station_ids array must be provided.",
    },
  );

export const propertyStationParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  stationId: z.coerce.number().int().positive().optional(),
});

export type AssociateStationsBodyInput = z.infer<
  typeof associateStationsBodySchema
>;
export type PropertyStationParams = z.infer<typeof propertyStationParamsSchema>;
