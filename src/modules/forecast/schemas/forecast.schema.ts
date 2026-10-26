import z from "zod";

export const forecastParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const forecastQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(7).default(7),
});
