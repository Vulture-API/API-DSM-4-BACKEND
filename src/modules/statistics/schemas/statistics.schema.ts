import z from "zod";

const DAY_MS = 86_400_000;

// Aceita só data (YYYY-MM-DD, em UTC) ou data-hora com fuso explícito.
// Data-hora sem fuso seria lida no fuso do servidor.
const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime({ offset: true });

const startOf = z
  .union([isoDate, isoDateTime])
  .transform((value) =>
    isoDate.safeParse(value).success
      ? new Date(`${value}T00:00:00.000Z`)
      : new Date(value),
  );

// Data pura no fim do período inclui o dia inteiro (o fim é exclusivo).
const endOf = z
  .union([isoDate, isoDateTime])
  .transform((value) =>
    isoDate.safeParse(value).success
      ? new Date(Date.parse(`${value}T00:00:00.000Z`) + DAY_MS)
      : new Date(value),
  );

const period = {
  from: startOf.optional(),
  to: endOf.optional(),
};

export const statisticsQuerySchema = z
  .object({
    ...period,
    property_id: z.coerce.number().int().positive().optional(),
  })
  .strict();

export const stationStatisticsQuerySchema = z.object(period).strict();

export const statisticsStationParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
