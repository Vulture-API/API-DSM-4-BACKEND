import "dotenv/config";
import "@/config/zod.config.js";

import z from "zod";

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  STATION_OFFLINE_THRESHOLD_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10),
  // Motor de regras
  RULES_ENGINE_ENABLED: z
    .enum(["true", "false"])
    // Desligado por padrão: o banco de development é compartilhado e um motor
    // ligado sem querer consome o checkpoint do time inteiro.
    .default("false")
    .transform((value) => value === "true"),
  RULES_ENGINE_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  RULES_ENGINE_BATCH_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .max(5000)
    .default(500),
  // Intervalo de consulta das leituras novas enviadas pelo WebSocket
  CURRENT_READINGS_POLL_MS: z.coerce.number().int().positive().default(3000),
});

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  const errors = result.error.issues
    .map((error) => `- ${error.path.join(".")}: ${error.message}`)
    .join("\n");

  throw new Error(`Invalid environment variables:\n${errors}`);
}

export const env = result.data;
