import pino, {
  type DestinationStream,
  type LevelWithSilent,
  type Logger as PinoLogger,
  type LoggerOptions as PinoLoggerOptions,
} from "pino";

import { sanitizeLogData } from "./sanitizer.js";

export type LogLevel = LevelWithSilent;

export interface LogErrorDetails {
  name: string;
  message: string;
  code?: string | number | undefined;
  stack?: string | undefined;
}

export interface StructuredLogPayload {
  component?: string | undefined;
  operation?: string | undefined;
  requestId?: string | undefined;
  result?: string | number | undefined;
  durationMs?: number | undefined;
  statusCode?: number | undefined;
  actor?:
    | {
        id?: number | string | undefined;
        email?: string | undefined;
        role?: string | undefined;
      }
    | undefined;
  error?: LogErrorDetails | undefined;
  [key: string]: unknown;
}

export interface CreateLoggerOptions {
  level?: LogLevel | undefined;
  component?: string | undefined;
  stream?: DestinationStream | undefined;
}

const REDACT_PATHS = [
  "password",
  "*.password",
  "*.*.password",
  "*.*.*.password",
  "senha",
  "*.senha",
  "*.*.senha",
  "*.*.*.senha",
  "secret",
  "*.secret",
  "*.*.secret",
  "token",
  "*.token",
  "*.*.token",
  "*.*.*.token",
  "jwt",
  "*.jwt",
  "bearer",
  "*.bearer",
  "authorization",
  "*.authorization",
  "headers.authorization",
  "headers.cookie",
  "headers['set-cookie']",
  "cookie",
  "*.cookie",
  "apiKey",
  "*.apiKey",
  "api_key",
  "*.api_key",
  "credential",
  "*.credential",
  "credentials",
  "*.credentials",
];

export function createLogger(options: CreateLoggerOptions = {}): PinoLogger {
  const level =
    options.level ??
    (process.env.LOG_LEVEL as LogLevel | undefined) ??
    (process.env.NODE_ENV === "test" ? "silent" : "info");

  const pinoOptions: PinoLoggerOptions = {
    level,
    messageKey: "message",
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: {
      level(label) {
        return { level: label };
      },
      log(object: Record<string, unknown>) {
        return sanitizeLogData(object);
      },
    },
    base: {
      component: options.component ?? "app",
    },
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
    },
  };

  return options.stream ? pino(pinoOptions, options.stream) : pino(pinoOptions);
}

export const logger = createLogger();
export type AppLogger = PinoLogger;
