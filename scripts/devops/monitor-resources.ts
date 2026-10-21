#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

export type ResourceReport = {
  timestamp: string;
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  uptimeSeconds: number;
  resources: {
    memory: {
      heapUsedMb: number;
      heapTotalMb: number;
      rssMb: number;
      heapUsagePercent: number;
    };
    cpu: {
      userMicroseconds: number;
      systemMicroseconds: number;
      cpuPercent: number;
    };
    eventLoop: {
      lagMs: number;
      status: "NORMAL" | "WARNING" | "CRITICAL";
    };
    databasePool: {
      totalConnections: number;
      idleConnections: number;
      activeConnections: number;
      waitingClients: number;
    };
    system: {
      totalMemoryBytes: number;
      freeMemoryBytes: number;
      usedMemoryBytes: number;
      memoryUsagePercent: number;
      cpuCores: number;
      loadAverage1m: number;
    };
  };
  bottlenecks: Array<{
    type: string;
    severity: "WARNING" | "CRITICAL";
    resource: string;
    message: string;
    currentValue: number | string;
    threshold: number | string;
    mitigation: string;
    timestamp: string;
  }>;
};

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";

function colorizeStatus(status: string): string {
  if (status === "HEALTHY" || status === "NORMAL" || status === "UP") {
    return `${GREEN}${BOLD}${status}${RESET}`;
  }
  if (status === "DEGRADED" || status === "WARNING") {
    return `${YELLOW}${BOLD}${status}${RESET}`;
  }
  return `${RED}${BOLD}${status}${RESET}`;
}

function renderProgressBar(percent: number, width = 20): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);

  if (clamped >= 90) return `${RED}[${bar}] ${clamped.toFixed(1)}%${RESET}`;
  if (clamped >= 80) return `${YELLOW}[${bar}] ${clamped.toFixed(1)}%${RESET}`;
  return `${GREEN}[${bar}] ${clamped.toFixed(1)}%${RESET}`;
}

export async function fetchResources(apiUrl: string): Promise<ResourceReport> {
  const url = `${apiUrl.replace(/\/$/, "")}/api/devops/resources`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as ResourceReport;
  } catch (err: unknown) {
    clearTimeout(timeout);
    throw err;
  }
}

export function displayResourceDashboard(report: ResourceReport, apiUrl: string): void {
  console.clear?.();
  console.log("=".repeat(78));
  console.log(
    `${CYAN}${BOLD}  VULTURE — MONITORAMENTO DE RECURSOS E DESEMPENHO DA APLICAÇÃO${RESET}`,
  );
  console.log("=".repeat(78));

  const uptimeHours = (report.uptimeSeconds / 3600).toFixed(2);
  console.log(
    `  Target API: ${BOLD}${apiUrl}${RESET} | Timestamp: ${report.timestamp}`,
  );
  console.log(
    `  Status Geral: ${colorizeStatus(report.status)} | Uptime: ${report.uptimeSeconds}s (~${uptimeHours}h)\n`,
  );

  console.log(`${BOLD}1. CONSUMO DE RECURSOS DO PROCESSO NODE.JS:${RESET}`);
  console.log(
    `  • Memória Heap V8:  ${report.resources.memory.heapUsedMb} MB / ${report.resources.memory.heapTotalMb} MB ${renderProgressBar(report.resources.memory.heapUsagePercent)}`,
  );
  console.log(
    `  • Memória RSS (SO): ${report.resources.memory.rssMb} MB (física alocada pelo sistema)`,
  );
  console.log(
    `  • Utilização CPU:   ${renderProgressBar(report.resources.cpu.cpuPercent)}`,
  );
  console.log(
    `  • Event Loop Lag:   ${report.resources.eventLoop.lagMs} ms  [Status: ${colorizeStatus(report.resources.eventLoop.status)}]`,
  );
  console.log("");

  console.log(`${BOLD}2. POOL DE CONEXÕES COM O BANCO DE DADOS (POSTGRESQL):${RESET}`);
  const pool = report.resources.databasePool;
  console.log(
    `  • Conexões Totais: ${pool.totalConnections} | Ativas: ${pool.activeConnections} | Ociosas: ${pool.idleConnections}`,
  );
  const queueColor = pool.waitingClients > 0 ? RED : GREEN;
  console.log(
    `  • Clientes em Fila de Espera: ${queueColor}${BOLD}${pool.waitingClients}${RESET}`,
  );
  console.log("");

  console.log(`${BOLD}3. RECURSOS DO SERVIDOR HOSPEDEIRO / CONTAINER:${RESET}`);
  const sys = report.resources.system;
  const totalGb = (sys.totalMemoryBytes / (1024 * 1024 * 1024)).toFixed(2);
  const freeGb = (sys.freeMemoryBytes / (1024 * 1024 * 1024)).toFixed(2);
  console.log(
    `  • Memória RAM do Host: ${freeGb} GB livres de ${totalGb} GB ${renderProgressBar(sys.memoryUsagePercent)}`,
  );
  console.log(
    `  • CPU Cores Disponíveis: ${sys.cpuCores} núcleos | Load Average (1m): ${sys.loadAverage1m}`,
  );
  console.log("");

  console.log(`${BOLD}4. DIAGNÓSTICO E DETECÇÃO DE GARGALOS OPERACIONAIS:${RESET}`);
  if (!report.bottlenecks || report.bottlenecks.length === 0) {
    console.log(`  ${GREEN}✓ Nenhum gargalo operacional detectado. Recursos dentro dos limiares normais.${RESET}`);
  } else {
    console.log(
      `  ${RED}${BOLD}⚠ ${report.bottlenecks.length} GARGALO(S) OU DEGRADAÇÃO(ÕES) IDENTIFICADO(S):${RESET}`,
    );
    for (const b of report.bottlenecks) {
      console.log(`  ------------------------------------------------------------`);
      console.log(
        `  [${colorizeStatus(b.severity)}] ${BOLD}${b.type}${RESET} em ${b.resource}`,
      );
      console.log(`  • Problema:      ${b.message}`);
      console.log(`  • Valor / Limite: ${b.currentValue} (limiar: ${b.threshold})`);
      console.log(`  • Mitigação:     ${BLUE}${b.mitigation}${RESET}`);
    }
    console.log(`  ------------------------------------------------------------`);
  }
  console.log("=".repeat(78));
}

async function main() {
  const args = process.argv.slice(2);
  const once = args.includes("--once");
  const apiUrl =
    process.env.API_URL ||
    process.env.PROD_API_URL ||
    "http://localhost:3000";

  const outputIndex = args.indexOf("--output");
  const outputPath =
    outputIndex !== -1 ? args[outputIndex + 1] : process.env.REPORT_OUTPUT;

  const intervalArg = args.find((a) => a.startsWith("--interval="));
  const intervalSeconds = intervalArg
    ? Number.parseInt(intervalArg.split("=")[1] ?? "5", 10)
    : 5;

  const runIteration = async () => {
    try {
      const report = await fetchResources(apiUrl);
      displayResourceDashboard(report, apiUrl);

      if (outputPath) {
        const resolved = path.resolve(outputPath);
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, JSON.stringify(report, null, 2), "utf8");
        console.log(`[DevOps CLI] Relatório exportado com sucesso para: ${resolved}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `${RED}[ERRO] Falha ao coletar recursos de ${apiUrl}: ${msg}${RESET}`,
      );
    }
  };

  await runIteration();

  if (!once) {
    console.log(
      `[DevOps CLI] Monitoramento ativo contínuo a cada ${intervalSeconds}s (Ctrl+C para sair)...`,
    );
    setInterval(runIteration, intervalSeconds * 1000);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Erro fatal na CLI de monitoramento de recursos:", err);
    process.exit(1);
  });
}
