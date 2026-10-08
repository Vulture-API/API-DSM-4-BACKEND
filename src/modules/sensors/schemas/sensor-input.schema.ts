import z from "zod";

export const sensorInputSchema = z.object({
  station_id: z.coerce.number().int().positive(),
  sensor_type_id: z.coerce.number().int().positive(),
  local_identifier: z.string().min(1).max(50),
  operational_status: z.boolean().default(true),
});

export type SensorInput = z.infer<typeof sensorInputSchema>;
