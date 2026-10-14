import z from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(150)),
  password: z.string().min(1).max(1024),
});
export const tokenSchema = z.object({
  access_token: z.string(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int(),
});
