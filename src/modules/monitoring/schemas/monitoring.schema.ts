import z from "zod";

export const overviewQuerySchema = z.object({
  property_id: z.coerce.number().int().positive().optional(),
});

/** Pontos por tipo de sensor: janela / intervalo. Barra consultas enormes. */
export const MAX_SERIES_POINTS = 500;

const seriesWindow = z.object({
  hours: z.coerce.number().int().min(1).max(720).default(24),
  bucket_minutes: z.coerce.number().int().min(5).max(1440).default(60),
});

const withinPointLimit = (q: z.infer<typeof seriesWindow>) =>
  (q.hours * 60) / q.bucket_minutes <= MAX_SERIES_POINTS;
const pointLimitError = {
  message: `hours * 60 / bucket_minutes must be at most ${MAX_SERIES_POINTS} points`,
  path: ["bucket_minutes"],
};

// Até 30 dias; intervalos de 5 min a 1 dia; no máximo 500 pontos por série.
export const seriesQuerySchema = seriesWindow
  .extend({ property_id: z.coerce.number().int().positive().optional() })
  .refine(withinPointLimit, pointLimitError);

export const stationSeriesQuerySchema = seriesWindow.refine(
  withinPointLimit,
  pointLimitError,
);

export const stationIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
export type SeriesQuery = z.infer<typeof seriesQuerySchema>;
