import z from "zod";

export const roleSchema = z.object({
  id: z.number().int(),
  name: z.string().max(50),
  description: z.string().max(255).nullable(),
  created_at: z.iso.datetime(),
});
