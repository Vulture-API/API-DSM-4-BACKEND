import z from "zod";

// Calibração padrão do tipo (SCRUM-600). Omitido no PUT = mantém o valor
// atual; null = remove. Fator e ganho zero são recusados no serviço.
// Limites físicos do tipo (SCRUM-634), mesma faixa dos limites do sensor.
// Omitido no PUT = mantém o valor atual; null = remove.
const limitSchema = z.number().gt(-1e8).lt(1e8).nullable().optional();

export const sensorTypeInputSchema = z
  .object({
    name: z.string().min(1).max(50),
    unit_of_measure: z.string().min(1).max(20),
    factor: z.number().optional().nullable(),
    gain: z.number().optional().nullable(),
    offset_value: z.number().optional().nullable(),
    min_value: limitSchema,
    max_value: limitSchema,
  })
  .refine(
    (value) =>
      value.min_value === undefined ||
      value.min_value === null ||
      value.max_value === undefined ||
      value.max_value === null ||
      value.min_value <= value.max_value,
    { message: "min_value must be <= max_value", path: ["min_value"] },
  );

export type SensorTypeInput = z.infer<typeof sensorTypeInputSchema>;
