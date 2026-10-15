import "dotenv/config";
import "@/config/zod.config.js";

import z from "zod";

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    JWT_SECRET: z.string().min(32).optional(),
    ACCESS_CONTROL_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    RATE_LIMIT_MAX: z.coerce
      .number()
      .int()
      .positive()
      .max(1_000_000)
      .default(300),
    LOGIN_RATE_LIMIT_MAX: z.coerce
      .number()
      .int()
      .positive()
      .max(1_000_000)
      .default(10),
    RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .positive()
      .max(86_400_000)
      .default(60_000),
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
    RULES_ENGINE_INTERVAL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15_000),
    RULES_ENGINE_BATCH_SIZE: z.coerce
      .number()
      .int()
      .positive()
      .max(5000)
      .default(500),
    // Intervalo de consulta das leituras novas enviadas pelo WebSocket
    CURRENT_READINGS_POLL_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(60_000)
      .default(3000),
    CURRENT_READINGS_MAX_CONNECTIONS: z.coerce
      .number()
      .int()
      .positive()
      .default(200),
    // Ocorrências de falhas (SCRUM-423/424). Desligado por padrão pelo mesmo
    // motivo do motor: o checkpoint fica no banco compartilhado.
    OCCURRENCES_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    OCCURRENCES_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
    OCCURRENCES_BATCH_SIZE: z.coerce
      .number()
      .int()
      .positive()
      .max(5000)
      .default(500),
    // Previsão meteorológica (Open-Meteo)
    FORECAST_API_URL: z
      .url({ protocol: /^https$/ })
      .default("https://api.open-meteo.com/v1/forecast"),
    FORECAST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(500)
      .max(30_000)
      .default(5000),
    FORECAST_CACHE_TTL_MINUTES: z.coerce
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .default(30),
  })
  .refine((value) => !value.ACCESS_CONTROL_ENABLED || !!value.JWT_SECRET, {
    message: "JWT_SECRET is required when ACCESS_CONTROL_ENABLED=true",
    path: ["JWT_SECRET"],
  });

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  const errors = result.error.issues
    .map((error) => `- ${error.path.join(".")}: ${error.message}`)
    .join("\n");

  throw new Error(`Invalid environment variables:\n${errors}`);
}

export const env = result.data;
