import z from "zod";

export const roleInputSchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().max(255).nullable().default(null),
});

export const roleIdSchema = z.object({
  id: z.coerce.number().int().positive().max(2_147_483_647),
});

export type RoleInput = z.infer<typeof roleInputSchema>;

export const roleSchema = z.object({
  id: z.number().int(),
  name: z.string().max(50),
  description: z.string().max(255).nullable(),
  created_at: z.iso.datetime(),
  permissions: z.array(z.string()),
});
