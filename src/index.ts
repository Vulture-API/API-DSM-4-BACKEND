import { buildApp } from "@/app.js";
import { database } from "@/config/database.js";
import { env } from "@/config/environment.js";
import { createShutdown } from "@/lifecycle.js";
import {
  PgAlertConfigRepository,
  PgTriggeredAlertRepository,
} from "@/modules/alerts/repositories/pg-alert.repository.js";
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
const app = buildApp({
  alertConfigRepository,
  triggeredAlertRepository,
  rulesEngineWorker,
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
  console.log(`AgriTech backend: http://localhost:${env.PORT}`);
} catch (error) {
  console.error("Falha ao iniciar backend:", error);
  process.exitCode = 1;
  await shutdown();
}
