import z from "zod";

const period = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

export const statisticsQuerySchema = z.object({
  ...period,
  property_id: z.coerce.number().int().positive().optional(),
});

export const stationStatisticsQuerySchema = z.object(period);

export const statisticsStationParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
