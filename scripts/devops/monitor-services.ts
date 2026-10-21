import fs from "node:fs";
import path from "node:path";

export type ProbeTarget = {
  name: string;
  url: string;
  expectedStatus?: number[];
  critical?: boolean;
};

export type ProbeSample = {
  timestamp: string;
  statusCode: number;
  durationMs: number;
  success: boolean;
  error?: string | undefined;
};

export type ServiceMonitoringResult = {
  serviceName: string;
  targetUrl: string;
  totalProbes: number;
  successfulProbes: number;
  failedProbes: number;
  availabilityPercentage: number;
  latencyMs: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
  };
  status: "HEALTHY" | "DEGRADED" | "DOWN";
  degradationReason?: string | undefined;
  samples: ProbeSample[];
};

export type MonitoringExecutionReport = {
  executionDate: string;
  overallStatus: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  slaAvailabilityTarget: number;
  latencyThresholdNormalMs: number;
  latencyThresholdDegradedMs: number;
  totalServicesMonitored: number;
  healthyServices: number;
  degradedServices: number;
  downServices: number;
  services: ServiceMonitoringResult[];
};

export function calculatePercentiles(durations: number[]) {
  if (durations.length === 0) {
    return { min: 0, max: 0, mean: 0, p50: 0, p95: 0 };
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = Number((sum / sorted.length).toFixed(2));
  const min = Number((sorted[0] ?? 0).toFixed(2));
  const max = Number((sorted[sorted.length - 1] ?? 0).toFixed(2));

  const getP = (p: number) => {
    const idx = Math.min(
      Math.floor((p / 100) * sorted.length),
      sorted.length - 1,
    );
    return Number((sorted[idx] ?? 0).toFixed(2));
  };

  return { min, max, mean, p50: getP(50), p95: getP(95) };
}

export async function probeUrl(
  url: string,
  expectedStatus = [200],
): Promise<ProbeSample> {
  const start = performance.now();
  const timestamp = new Date().toISOString();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const durationMs = Number((performance.now() - start).toFixed(2));
    const success = expectedStatus.includes(response.status);
    return {
      timestamp,
      statusCode: response.status,
      durationMs,
      success,
      ...(!success
        ? {
            error: `HTTP ${response.status} not in [${expectedStatus.join(", ")}]`,
          }
        : {}),
    };
  } catch (err: unknown) {
    const durationMs = Number((performance.now() - start).toFixed(2));
    const message = err instanceof Error ? err.message : String(err);
    return {
      timestamp,
      statusCode: 0,
      durationMs,
      success: false,
      error: message,
    };
  }
}

export async function monitorServices(
  targets: ProbeTarget[],
  iterations = 5,
  options: {
    latencyNormalThresholdMs?: number;
    latencyCriticalThresholdMs?: number;
    slaAvailabilityTarget?: number;
  } = {},
): Promise<MonitoringExecutionReport> {
  const latencyNormalThresholdMs = options.latencyNormalThresholdMs ?? 200;
  const latencyCriticalThresholdMs = options.latencyCriticalThresholdMs ?? 500;
  const slaAvailabilityTarget = options.slaAvailabilityTarget ?? 99.0;

  const results: ServiceMonitoringResult[] = [];

  for (const target of targets) {
    const samples: ProbeSample[] = [];
    for (let i = 0; i < iterations; i++) {
      const sample = await probeUrl(target.url, target.expectedStatus ?? [200]);
      samples.push(sample);
      if (i < iterations - 1) {
        await new Promise((r) => setTimeout(r, 100)); // pequeno intervalo entre sondas
      }
    }

    const successfulProbes = samples.filter((s) => s.success).length;
    const failedProbes = samples.length - successfulProbes;
    const availabilityPercentage = Number(
      ((successfulProbes / samples.length) * 100).toFixed(2),
    );

    const successfulDurations = samples
      .filter((s) => s.success)
      .map((s) => s.durationMs);
    const latencyMs = calculatePercentiles(successfulDurations);

    let status: "HEALTHY" | "DEGRADED" | "DOWN" = "HEALTHY";
    let degradationReason: string | undefined;

    if (successfulProbes === 0) {
      status = "DOWN";
      degradationReason = `Serviço inalcançável (100% de falha nas sondas). Último erro: ${samples[samples.length - 1]?.error}`;
    } else if (availabilityPercentage < slaAvailabilityTarget) {
      status = "DEGRADED";
      degradationReason = `Disponibilidade (${availabilityPercentage}%) abaixo da meta de SLA (${slaAvailabilityTarget}%)`;
    } else if (latencyMs.p95 >= latencyCriticalThresholdMs) {
      status = "DEGRADED";
      degradationReason = `Latência p95 (${latencyMs.p95}ms) violou limite crítico (${latencyCriticalThresholdMs}ms)`;
    } else if (latencyMs.mean >= latencyNormalThresholdMs) {
      status = "DEGRADED";
      degradationReason = `Latência média (${latencyMs.mean}ms) violou limite de atenção (${latencyNormalThresholdMs}ms)`;
    }

    results.push({
      serviceName: target.name,
      targetUrl: target.url,
      totalProbes: samples.length,
      successfulProbes,
      failedProbes,
      availabilityPercentage,
      latencyMs,
      status,
      degradationReason,
      samples,
    });
  }

  const downServices = results.filter((r) => r.status === "DOWN").length;
  const degradedServices = results.filter(
    (r) => r.status === "DEGRADED",
  ).length;
  const healthyServices = results.filter((r) => r.status === "HEALTHY").length;

  let overallStatus: "HEALTHY" | "DEGRADED" | "UNHEALTHY" = "HEALTHY";
  if (downServices > 0) {
    overallStatus = "UNHEALTHY";
  } else if (degradedServices > 0) {
    overallStatus = "DEGRADED";
  }

  return {
    executionDate: new Date().toISOString(),
    overallStatus,
    slaAvailabilityTarget,
    latencyThresholdNormalMs: latencyNormalThresholdMs,
    latencyThresholdDegradedMs: latencyCriticalThresholdMs,
    totalServicesMonitored: results.length,
    healthyServices,
    degradedServices,
    downServices,
    services: results,
  };
}

export function formatTerminalTable(report: MonitoringExecutionReport): string {
  const statusEmoji = {
    HEALTHY: "🟢 HEALTHY",
    DEGRADED: "🟡 DEGRADED",
    DOWN: "🔴 DOWN",
    UNHEALTHY: "🔴 UNHEALTHY",
  };

  const lines: string[] = [];
  lines.push(
    "=====================================================================================================",
  );
  lines.push(
    "                           RELATÓRIO DE MONITORAMENTO DEVOPS — VULTURE                              ",
  );
  lines.push(
    "=====================================================================================================",
  );
  lines.push(`Data/Hora: ${report.executionDate}`);
  lines.push(`Status Geral: ${statusEmoji[report.overallStatus]}`);
  lines.push(
    `Meta de SLA Disponibilidade: ${report.slaAvailabilityTarget}% | Limiar Latência p95: ${report.latencyThresholdDegradedMs}ms`,
  );
  lines.push(
    `Serviços Analisados: ${report.totalServicesMonitored} | Saudáveis: ${report.healthyServices} | Degradados: ${report.degradedServices} | Fora: ${report.downServices}`,
  );
  lines.push(
    "-----------------------------------------------------------------------------------------------------",
  );
  lines.push(
    [
      "SERVIÇO".padEnd(25),
      "STATUS".padEnd(14),
      "DISPONIBILIDADE".padEnd(16),
      "MÉDIA (ms)".padEnd(12),
      "p50 (ms)".padEnd(10),
      "p95 (ms)".padEnd(10),
      "MÁX (ms)".padEnd(10),
    ].join(" "),
  );
  lines.push(
    "-----------------------------------------------------------------------------------------------------",
  );

  for (const s of report.services) {
    lines.push(
      [
        s.serviceName.padEnd(25),
        statusEmoji[s.status].padEnd(14),
        `${s.availabilityPercentage}%`.padEnd(16),
        `${s.latencyMs.mean} ms`.padEnd(12),
        `${s.latencyMs.p50} ms`.padEnd(10),
        `${s.latencyMs.p95} ms`.padEnd(10),
        `${s.latencyMs.max} ms`.padEnd(10),
      ].join(" "),
    );
    if (s.degradationReason) {
      lines.push(`   ↳ ALERTA: ${s.degradationReason}`);
    }
  }
  lines.push(
    "=====================================================================================================",
  );
  return lines.join("\n");
}

export function formatMarkdownSummary(
  report: MonitoringExecutionReport,
): string {
  const statusBadge = {
    HEALTHY: "🟢 **HEALTHY**",
    DEGRADED: "🟡 **DEGRADED**",
    DOWN: "🔴 **DOWN**",
    UNHEALTHY: "🔴 **UNHEALTHY**",
  };

  const lines: string[] = [
    `# 🩺 Relatório de Monitoramento DevOps — Disponibilidade e Latência`,
    ``,
    `* **Data de Execução:** \`${report.executionDate}\``,
    `* **Status Consolidado:** ${statusBadge[report.overallStatus]}`,
    `* **Meta de SLA:** $\\ge ${report.slaAvailabilityTarget}\\%$ de disponibilidade | Latência normal: $< ${report.latencyThresholdNormalMs}\\text{ ms}$ | Limiar crítico $p95$: $< ${report.latencyThresholdDegradedMs}\\text{ ms}$`,
    `* **Total de Serviços:** ${report.totalServicesMonitored} (🟢 ${report.healthyServices} saudáveis, 🟡 ${report.degradedServices} degradados, 🔴 ${report.downServices} indisponíveis)`,
    ``,
    `### Matriz de Serviços Monitorados`,
    ``,
    `| Serviço | Endpoint | Status | Disponibilidade | Média ($ms$) | p50 ($ms$) | p95 ($ms$) | Máx ($ms$) | Diagnóstico |`,
    `| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |`,
  ];

  for (const s of report.services) {
    const diag = s.degradationReason
      ? `⚠️ ${s.degradationReason}`
      : "Operação Normal";
    lines.push(
      `| **${s.serviceName}** | \`${s.targetUrl}\` | ${statusBadge[s.status]} | **${s.availabilityPercentage}%** | ${s.latencyMs.mean} ms | ${s.latencyMs.p50} ms | ${s.latencyMs.p95} ms | ${s.latencyMs.max} ms | ${diag} |`,
    );
  }

  return lines.join("\n");
}

// CLI Runner principal
async function runCLI() {
  const backendBase =
    process.env.PROD_API_URL ||
    process.env.BACKEND_URL ||
    "http://localhost:3000";
  const frontendBase =
    process.env.PROD_FRONT_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:3010";

  const targets: ProbeTarget[] = [
    {
      name: "Backend - Health Base",
      url: `${backendBase}/health`,
      critical: true,
    },
    {
      name: "Backend - Health Detailed",
      url: `${backendBase}/health/detailed`,
      critical: true,
    },
    {
      name: "Backend - Prometheus Metrics",
      url: `${backendBase}/metrics`,
      critical: true,
    },
    {
      name: "Backend - DevOps Ping",
      url: `${backendBase}/api/devops/ping`,
      critical: false,
    },
    {
      name: "Backend - Raiz (API Info)",
      url: `${backendBase}/`,
      critical: false,
    },
    { name: "Frontend - Portal Web", url: `${frontendBase}/`, critical: true },
  ];

  const iterations = Number(process.env.MONITOR_ITERATIONS || 5);
  const report = await monitorServices(targets, iterations);

  console.log(formatTerminalTable(report));

  const outputDir = path.resolve(process.cwd(), "docs/devops");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const jsonReportPath = path.join(outputDir, "monitoring-report.json");
  fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nRelatório JSON salvo em: ${jsonReportPath}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      formatMarkdownSummary(report),
    );
  }

  if (report.overallStatus === "UNHEALTHY") {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCLI().catch((err) => {
    console.error("Erro fatal no monitoramento:", err);
    process.exit(1);
  });
}
