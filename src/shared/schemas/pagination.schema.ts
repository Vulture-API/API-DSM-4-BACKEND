import z from "zod";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const idPathSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type IdPath = z.infer<typeof idPathSchema>;

export interface PaginationMeta {
  total_records: number;
  total_pages: number;
  current_page: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}
