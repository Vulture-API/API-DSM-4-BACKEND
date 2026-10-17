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
