import z from "zod";

// Calibração padrão do tipo (SCRUM-600). Omitido no PUT = mantém o valor
// atual; null = remove. Fator e ganho zero são recusados no serviço.
export const sensorTypeInputSchema = z.object({
  name: z.string().min(1).max(50),
  unit_of_measure: z.string().min(1).max(20),
  factor: z.number().optional().nullable(),
  gain: z.number().optional().nullable(),
  offset_value: z.number().optional().nullable(),
});

export type SensorTypeInput = z.infer<typeof sensorTypeInputSchema>;
