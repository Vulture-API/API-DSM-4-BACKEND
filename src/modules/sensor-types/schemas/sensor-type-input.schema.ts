import z from "zod";

export const sensorTypeInputSchema = z.object({
  name: z.string().min(1).max(50),
  unit_of_measure: z.string().min(1).max(20),
  factor: z.number().optional().nullable(),
  gain: z.number().optional().nullable(),
});

export type SensorTypeInput = z.infer<typeof sensorTypeInputSchema>;
