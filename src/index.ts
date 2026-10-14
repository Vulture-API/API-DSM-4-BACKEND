import { buildApp } from "@/app.js";
import { database } from "@/config/database.js";
import { env } from "@/config/environment.js";
import { createShutdown } from "@/lifecycle.js";
import {
  PgAlertConfigRepository,
  PgTriggeredAlertRepository,
} from "@/modules/alerts/repositories/pg-alert.repository.js";
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
      console.log(
        `[rules-engine] ${result.readings_processed} leituras, ${result.alerts_triggered} alertas, checkpoint ${result.last_reading_id}`,
      );
    },
    onError: (error) =>
      console.error("[rules-engine] falha de processamento:", error),
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
      console.log(
        `[occurrences] ${communication.failures_opened} falhas de comunicação abertas, ${communication.failures_resolved} resolvidas, ${limits.out_of_range} leituras fora do limite (checkpoint ${limits.last_reading_id})`,
      );
    },
    onError: (error) =>
      console.error("[occurrences] falha na verificação:", error),
  },
);
const app = buildApp({
  alertConfigRepository,
  triggeredAlertRepository,
  rulesEngineWorker,
  occurrenceRepository,
  occurrenceMonitorWorker,
});
const shutdown = createShutdown(app, database);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log(`Recebido ${signal}. Encerrando backend...`);
    void shutdown().catch((error: unknown) => {
      console.error("Falha ao encerrar backend:", error);
      process.exitCode = 1;
    });
  });
}
try {
  await app.listen({ host: "0.0.0.0", port: env.PORT });
  if (env.RULES_ENGINE_ENABLED) rulesEngineWorker.start();
  if (env.OCCURRENCES_ENABLED) occurrenceMonitorWorker.start();
  console.log(`AgriTech backend: http://localhost:${env.PORT}`);
} catch (error) {
  console.error("Falha ao iniciar backend:", error);
  process.exitCode = 1;
  await shutdown();
}
