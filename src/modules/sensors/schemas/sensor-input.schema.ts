import z from "zod";

// Mesma precisão de readings.value (decimal(10,2)).
const limitSchema = z.number().gt(-1e8).lt(1e8).nullable().optional();

export const sensorInputSchema = z
  .object({
    station_id: z.coerce.number().int().positive(),
    sensor_type_id: z.coerce.number().int().positive(),
    local_identifier: z.string().min(1).max(50),
    operational_status: z.boolean().default(true),
    // Omitido no PUT = mantém o valor atual; null = remove o limite.
    min_value: limitSchema,
    max_value: limitSchema,
    // Calibração deste sensor (SCRUM-600): vale no lugar da do tipo. Mesma
    // regra de omitido/null dos limites. Ganho zero é recusado no serviço.
    gain: z.number().nullable().optional(),
    offset_value: z.number().nullable().optional(),
    model: z.string().trim().min(1).max(100).nullable().optional(),
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

export type SensorInput = z.infer<typeof sensorInputSchema>;
