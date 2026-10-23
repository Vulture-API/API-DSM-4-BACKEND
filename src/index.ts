import { buildApp } from "@/app.js";
import { database } from "@/config/database.js";
import { env } from "@/config/environment.js";
import { createShutdown } from "@/lifecycle.js";
import {
  PgAlertConfigRepository,
  PgTriggeredAlertRepository,
} from "@/modules/alerts/repositories/pg-alert.repository.js";
import { createLogger } from "@/modules/logging/logger.js";
import { PgOccurrenceRepository } from "@/modules/occurrences/repositories/pg-occurrence.repository.js";
import { CheckSensorLimitsService } from "@/modules/occurrences/services/check-sensor-limits.service.js";
import { DetectCommunicationFailuresService } from "@/modules/occurrences/services/detect-communication-failures.service.js";
import { OccurrenceMonitorWorker } from "@/modules/occurrences/services/occurrence-monitor.worker.js";
import {
  PgCheckpointRepository,
  PgReadingRepository,
} from "@/modules/rules-engine/repositories/pg-reading.repository.js";
import { ProcessReadingsService } from "@/modules/rules-engine/services/process-readings.service.js";
import { RulesEngineWorker } from "@/modules/rules-engine/services/rules-engine.worker.js";

const appLogger = createLogger({ level: env.LOG_LEVEL, component: "app" });
const rulesLogger = appLogger.child({ component: "rules-engine" });
const occurrencesLogger = appLogger.child({ component: "occurrences" });

const alertConfigRepository = new PgAlertConfigRepository(database);
const triggeredAlertRepository = new PgTriggeredAlertRepository(database);
const rulesEngineWorker = new RulesEngineWorker(
  new ProcessReadingsService(
    new PgReadingRepository(database),
    new PgCheckpointRepository(database),
    alertConfigRepository,
    triggeredAlertRepository,
    { batchSize: env.RULES_ENGINE_BATCH_SIZE },
  ),
  {
    intervalMs: env.RULES_ENGINE_INTERVAL_MS,
    onCycle: (result) => {
      if (result.readings_processed === 0) return;
      rulesLogger.info(
        {
          operation: "rules_engine_cycle",
          readingsProcessed: result.readings_processed,
          alertsTriggered: result.alerts_triggered,
          lastReadingId: result.last_reading_id,
        },
        `[rules-engine] ${result.readings_processed} leituras, ${result.alerts_triggered} alertas, checkpoint ${result.last_reading_id}`,
      );
    },
    onError: (error) =>
      rulesLogger.error(
        { operation: "rules_engine_cycle", error },
        "[rules-engine] falha de processamento",
      ),
  },
);
const occurrenceRepository = new PgOccurrenceRepository(database);
const occurrenceMonitorWorker = new OccurrenceMonitorWorker(
  new DetectCommunicationFailuresService(
    occurrenceRepository,
    env.STATION_OFFLINE_THRESHOLD_MINUTES,
  ),
  new CheckSensorLimitsService(occurrenceRepository, {
    batchSize: env.OCCURRENCES_BATCH_SIZE,
  }),
  {
    intervalMs: env.OCCURRENCES_INTERVAL_MS,
    onCycle: ({ communication, limits }) => {
      if (
        communication.failures_opened +
          communication.failures_resolved +
          limits.out_of_range ===
        0
      )
        return;
      occurrencesLogger.info(
        {
          operation: "occurrences_cycle",
          failuresOpened: communication.failures_opened,
          failuresResolved: communication.failures_resolved,
          outOfRange: limits.out_of_range,
          lastReadingId: limits.last_reading_id,
        },
        `[occurrences] ${communication.failures_opened} falhas de comunicação abertas, ${communication.failures_resolved} resolvidas, ${limits.out_of_range} leituras fora do limite (checkpoint ${limits.last_reading_id})`,
      );
    },
    onError: (error) =>
      occurrencesLogger.error(
        { operation: "occurrences_cycle", error },
        "[occurrences] falha na verificação",
      ),
  },
);
const app = buildApp({
  alertConfigRepository,
  triggeredAlertRepository,
  rulesEngineWorker,
  occurrenceRepository,
  occurrenceMonitorWorker,
  logger: appLogger,
});
const shutdown = createShutdown(app, database);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    appLogger.info(
      { operation: "shutdown", signal },
      `Recebido ${signal}. Encerrando backend...`,
    );
    void shutdown().catch((error: unknown) => {
      appLogger.error(
        { operation: "shutdown", error },
        "Falha ao encerrar backend",
      );
      process.exitCode = 1;
    });
  });
}
try {
  await app.listen({ host: "0.0.0.0", port: env.PORT });
  if (env.RULES_ENGINE_ENABLED) rulesEngineWorker.start();
  if (env.OCCURRENCES_ENABLED) occurrenceMonitorWorker.start();
  appLogger.info(
    { operation: "startup", port: env.PORT },
    `AgriTech backend iniciado na porta ${env.PORT}`,
  );
} catch (error) {
  appLogger.fatal({ operation: "startup", error }, "Falha ao iniciar backend");
  process.exitCode = 1;
  await shutdown();
}
