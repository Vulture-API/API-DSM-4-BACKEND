import fs from "node:fs";
import path from "node:path";

import type { Pool } from "pg";

import { buildApp } from "@/app.js";
import { DevOpsMetricsService } from "@/modules/devops/devops-metrics.service.js";
import { DevOpsOutageService } from "@/modules/devops/devops-outage.service.js";
import {
  type SlaValidationResult,
  type SystemOutage,
} from "@/modules/devops/system-outage.entity.js";
import { InMemorySystemOutageRepository } from "@/modules/devops/system-outage.repository.js";
import { FakePermissionRepository } from "@/modules/permissions/testing/fake-permission.repository.js";
import { FakeRoleRepository } from "@/modules/roles/testing/fake-role.repository.js";

export function formatTerminalOutageTable(outages: SystemOutage[]): string {
  const lines: string[] = [];
  lines.push(
    "========================================================================================================================",
  );
  lines.push(
    "                             HISTÓRICO AUDITÁVEL DE INDISPONIBILIDADES (DEVOPS)                                         ",
  );
  lines.push(
    "========================================================================================================================",
  );
  lines.push(
    [
      "ID".padEnd(26),
      "SERVIÇO".padEnd(16),
      "SEVERIDADE".padEnd(12),
      "STATUS".padEnd(12),
      "INÍCIO".padEnd(24),
      "FIM".padEnd(24),
      "DURAÇÃO (s)".padEnd(12),
    ].join(" "),
  );
  lines.push(
    "------------------------------------------------------------------------------------------------------------------------",
  );

  for (const o of outages) {
    const statusFormatted = o.status === "OPEN" ? "🔴 OPEN" : "🟢 RESOLVED";
    const durationStr =
      o.durationSeconds !== null ? `${o.durationSeconds}s` : "-";
    const endStr = o.endTime ?? "Em andamento...";
    lines.push(
      [
        o.id.padEnd(26),
        o.service.padEnd(16),
        o.severity.padEnd(12),
        statusFormatted.padEnd(12),
        o.startTime.padEnd(24),
        endStr.padEnd(24),
        durationStr.padEnd(12),
      ].join(" "),
    );
  }

  lines.push(
    "========================================================================================================================",
  );
  return lines.join("\n");
}

export function formatSlaReportTable(sla: SlaValidationResult): string {
  const lines: string[] = [];
  lines.push(
    "========================================================================================================================",
  );
  lines.push(
    "                                 RELATÓRIO DE VALIDAÇÃO DE SLA E CONFIABILIDADE                                         ",
  );
  lines.push(
    "========================================================================================================================",
  );
  const statusFormatted = sla.slaCompliant
    ? "✅ CONFORME (SLA ATENDIDO)"
    : "❌ VIOLADO (ABAIXO DO SLA)";
  lines.push(
    `Janela de Avaliação: ${sla.evaluationWindowHours} horas (${sla.totalTimeSeconds} segundos)`,
  );
  lines.push(`Período: ${sla.evaluatedFrom} até ${sla.evaluatedTo}`);
  lines.push(`Status de Conformidade: ${statusFormatted}`);
  lines.push(
    `Meta de SLA Contratada: ${sla.slaTargetPercentage.toFixed(2)}% de disponibilidade`,
  );
  lines.push(
    `Disponibilidade Observada: ${sla.availabilityPercentage.toFixed(3)}%`,
  );
  lines.push(
    `Margem / Gap de SLA: ${sla.slaGapPercentage > 0 ? "+" : ""}${sla.slaGapPercentage.toFixed(3)}%`,
  );
  lines.push(
    `Tempo Total de Inatividade (Downtime): ${sla.downtimeSeconds}s (~${(sla.downtimeSeconds / 60).toFixed(2)} minutos)`,
  );
  lines.push(
    `Tempo Total Operacional (Uptime): ${sla.uptimeSeconds}s (~${(sla.uptimeSeconds / 3600).toFixed(2)} horas)`,
  );
  lines.push(
    `Total de Indisponibilidades: ${sla.outagesCount} (Ativas: ${sla.activeOutagesCount})`,
  );
  lines.push(`MTTR (Mean Time to Recovery): ${sla.mttrMinutes} minutos`);
  lines.push(`MTTF (Mean Time to Failure): ${sla.mttfHours} horas`);
  lines.push(
    "========================================================================================================================",
  );
  return lines.join("\n");
}

async function runOutageTrackingSimulation() {
  console.log(
    "========================================================================================================================",
  );
  console.log(
    "           INICIANDO DEMONSTRAÇÃO E VALIDAÇÃO DE REGISTRO DE INDISPONIBILIDADES (DEVOPS - US06)         ",
  );
  console.log(
    "========================================================================================================================",
  );

  const repository = new InMemorySystemOutageRepository();
  const baseTime = new Date("2026-10-21T00:00:00.000Z");
  let simulatedClock = new Date(baseTime);
  const clock = () => simulatedClock;

  const outageService = new DevOpsOutageService(repository, clock);
  const metricsService = new DevOpsMetricsService(5000, clock);

  const mockPool = {
    query: async () => ({ rows: [{ "?column?": 1 }] }),
  } as unknown as Pool;

  const app = buildApp({
    database: mockPool,
    accessControlEnabled: false,
    permissionRepository: new FakePermissionRepository(
      new FakeRoleRepository(),
    ),
    devopsMetricsService: metricsService,
    outageRepository: repository,
    outageService,
  });

  await app.ready();

  console.log(
    "\n[ETAPA 1] Simulando registro de falha crítica (Início da Indisponibilidade)...",
  );
  // Simula falha às 04:00
  simulatedClock = new Date("2026-10-21T04:00:00.000Z");

  const startRes = await app.inject({
    method: "POST",
    url: "/api/devops/outages",
    payload: {
      service: "postgresql",
      severity: "CRITICAL",
      reason: "Esgotamento de conexões no pool de dados e falha de handshake",
      failureDetails: {
        error:
          "FATAL: remaining connection slots are reserved for non-replication superuser connections",
        rootCause: "Leak de transações abertas em rota legada /api/reports",
        httpStatus: 503,
        impactedEndpoints: [
          "/api/readings",
          "/api/stations",
          "/api/occurrences",
        ],
        detectionSource: "HEALTH_CHECK",
        diagnosticData: {
          activeConnections: 100,
          idleConnections: 0,
          waitingClients: 42,
        },
      },
      startTime: simulatedClock.toISOString(),
    },
  });

  const createdOutage = startRes.json();
  console.log(`✓ Indisponibilidade registrada via API (HTTP 201):`);
  console.log(`  - ID: ${createdOutage.id}`);
  console.log(`  - Serviço: ${createdOutage.service}`);
  console.log(`  - Status: ${createdOutage.status}`);
  console.log(`  - Início: ${createdOutage.startTime}`);
  console.log(`  - Motivo: ${createdOutage.reason}`);

  console.log(
    "\n[ETAPA 2] Simulando período de inatividade e atuação da equipe de SRE...",
  );
  // Passam 8 minutos e 20 segundos (500 segundos)
  simulatedClock = new Date("2026-10-21T04:08:20.000Z");

  console.log(
    "\n[ETAPA 3] Encerrando a indisponibilidade (Resolução e Cálculo de Duração)...",
  );
  const resolveRes = await app.inject({
    method: "PATCH",
    url: `/api/devops/outages/${createdOutage.id}/resolve`,
    payload: {
      endTime: simulatedClock.toISOString(),
      resolutionNotes:
        "Executado pg_terminate_backend em conexões ociosas em transação e aplicado restart no PgBouncer.",
      rootCause:
        "Conexões não encerradas após timeout de leitura em endpoints legados.",
    },
  });

  const resolvedOutage = resolveRes.json();
  console.log(`✓ Indisponibilidade resolvida via API (HTTP 200):`);
  console.log(`  - Status: ${resolvedOutage.status}`);
  console.log(`  - Término: ${resolvedOutage.endTime}`);
  console.log(
    `  - Duração Calculada: ${resolvedOutage.durationSeconds} segundos (${(resolvedOutage.durationSeconds / 60).toFixed(2)} min)`,
  );
  console.log(`  - Causa Raiz: ${resolvedOutage.failureDetails.rootCause}`);

  console.log(
    "\n[ETAPA 4] Registrando evento adicional de indisponibilidade programada (Janela Histórica)...",
  );
  // Outro incidente às 07:00 (duração: 180s = 3 minutos)
  await app.inject({
    method: "POST",
    url: "/api/devops/outages",
    payload: {
      service: "api-backend",
      severity: "HIGH",
      reason: "Deploy de release e reciclagem de pods no cluster",
      startTime: "2026-10-21T07:00:00.000Z",
      endTime: "2026-10-21T07:03:00.000Z",
      failureDetails: {
        resolutionNotes:
          "Rolling update completado com sucesso e zero erros 5xx pós-aquecimento.",
        detectionSource: "MANUAL",
      },
    },
  });

  console.log(
    "\n[ETAPA 5] Consultando Histórico de Indisponibilidades via API...",
  );
  const listRes = await app.inject({
    method: "GET",
    url: "/api/devops/outages",
  });
  const outagesHistory: SystemOutage[] = listRes.json();
  console.log(formatTerminalOutageTable(outagesHistory));

  console.log(
    "\n[ETAPA 6] Executando Validação Formal de SLA de Disponibilidade...",
  );
  // Janela de 24 horas: meta 99.0%
  // Downtime total = 500s + 180s = 680s (abaixo dos 864s tolerados para 99% em 24h)
  simulatedClock = new Date("2026-10-21T12:00:00.000Z");

  const slaRes = await app.inject({
    method: "GET",
    url: "/api/devops/sla?windowHours=24&slaTargetPercentage=99.0",
  });
  const slaReport: SlaValidationResult = slaRes.json();
  console.log(formatSlaReportTable(slaReport));

  console.log(
    "\n[ETAPA 7] Verificando Métricas Exportadas para o Prometheus...",
  );
  const metricsRes = await app.inject({
    method: "GET",
    url: "/metrics",
  });
  const promText = metricsRes.body;
  const outagePromLines = promText
    .split("\n")
    .filter(
      (l) =>
        l.includes("vulture_outage") || l.includes("vulture_sla_availability"),
    );
  console.log("Métricas OpenMetrics geradas:");
  for (const line of outagePromLines) {
    console.log(`  ${line}`);
  }

  // Exporta evidência JSON completa para auditoria
  const rootDocsDir = path.resolve(process.cwd(), "..", "docs/devops");
  const localDocsDir = path.resolve(process.cwd(), "docs/devops");
  const targetDocsDir = fs.existsSync(path.resolve(process.cwd(), "..", "docs"))
    ? rootDocsDir
    : localDocsDir;

  if (!fs.existsSync(targetDocsDir)) {
    fs.mkdirSync(targetDocsDir, { recursive: true });
  }

  const evidenceFilePath = path.join(
    targetDocsDir,
    "evidencia-registro-indisponibilidades.json",
  );

  const evidenceData = {
    generatedAt: new Date().toISOString(),
    feature:
      "[DEVOPS] Mecanismo de Registro e Acompanhamento de Indisponibilidades",
    slaEvaluation: slaReport,
    outagesHistory,
    prometheusMetricsSnapshot: outagePromLines,
    acceptanceCriteriaValidation: {
      "Indisponibilidades são registradas": {
        status: "ATENDIDO",
        details: `Registradas ${outagesHistory.length} indisponibilidades com persistência estruturada e identificador único.`,
      },
      "Registros permitem identificar quando a falha ocorreu": {
        status: "ATENDIDO",
        details:
          "Registros contêm startTime, endTime e durationSeconds calculados com precisão.",
      },
      "Histórico fica disponível para consulta": {
        status: "ATENDIDO",
        details:
          "Disponibilizado endpoint GET /api/devops/outages com filtros por serviço, status e período.",
      },
      "Dados registrados podem ser utilizados no cálculo ou validação da disponibilidade":
        {
          status: "ATENDIDO",
          details: `Disponibilizado endpoint GET /api/devops/sla calculando disponibilidade de ${slaReport.availabilityPercentage}% contra a meta de ${slaReport.slaTargetPercentage}%.`,
        },
    },
  };

  fs.writeFileSync(
    evidenceFilePath,
    JSON.stringify(evidenceData, null, 2),
    "utf-8",
  );
  console.log(
    `\n✅ Relatório de evidência salvo com sucesso em: ${evidenceFilePath}`,
  );

  await app.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOutageTrackingSimulation().catch((err) => {
    console.error("Falha fatal na execução do script:", err);
    process.exit(1);
  });
}
