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
