import z from "zod";

export const createUserSchema = z.object({
  role_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().toLowerCase().pipe(z.email().max(150)),
  password: z.string().min(8),
  active: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  role_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(150),
  active: z.boolean(),
});

export const userIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const userSchema = z.object({
  id: z.number().int(),
  role_id: z.number().int(),
  name: z.string().max(150),
  email: z.email().max(150),
  active: z.boolean(),
  created_at: z.iso.datetime(),
});

export const paginatedUsersSchema = z.object({
  data: z.array(userSchema),
  meta: z.object({
    total_records: z.number().int(),
    total_pages: z.number().int(),
    current_page: z.number().int(),
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
