import os from "node:os";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Pool } from "pg";

declare module "fastify" {
  interface FastifyRequest {
    metricsStartTime?: number;
  }
}

export type RequestMetric = {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  timestamp: number;
};

export type LatencyPercentiles = {
  count: number;
  mean: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
};

export type RouteMetricSummary = {
  route: string;
  method: string;
  totalRequests: number;
  errorCount: number;
  latency: LatencyPercentiles;
  status: "NORMAL" | "DEGRADED";
};

export type DegradationAlert = {
  severity: "WARNING" | "CRITICAL";
  type: "HIGH_LATENCY" | "HIGH_ERROR_RATE" | "DATABASE_DOWN" | "RESOURCE_EXHAUSTION";
  message: string;
  target?: string;
  currentValue?: number | string;
  threshold?: number | string;
  timestamp: string;
};

export type DatabaseHealth = {
  status: "UP" | "DEGRADED" | "DOWN";
  latencyMs?: number;
  error?: string;
};

// --- Tipos de Recursos Monitorados ---

export type ProcessMemoryMetrics = {
  heapUsedBytes: number;
  heapTotalBytes: number;
  rssBytes: number;
  externalBytes: number;
  heapUsedMb: number;
  heapTotalMb: number;
  rssMb: number;
  heapUsagePercent: number;
};

export type ProcessCpuMetrics = {
  userMicroseconds: number;
  systemMicroseconds: number;
  cpuPercent: number;
};

export type EventLoopMetrics = {
  lagMs: number;
  status: "NORMAL" | "WARNING" | "CRITICAL";
};

export type DatabasePoolMetrics = {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  waitingClients: number;
};

export type SystemResourceMetrics = {
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  usedMemoryBytes: number;
  memoryUsagePercent: number;
  cpuCores: number;
  loadAverage1m: number;
};

export type ApplicationResourceMetrics = {
  memory: ProcessMemoryMetrics;
  cpu: ProcessCpuMetrics;
  eventLoop: EventLoopMetrics;
  databasePool: DatabasePoolMetrics;
  system: SystemResourceMetrics;
};

// --- Tipos de Gargalos (Bottleneck Detection) ---

export type BottleneckType =
  | "HIGH_MEMORY"
  | "CPU_SATURATION"
  | "EVENT_LOOP_BLOCKED"
  | "DB_POOL_SATURATION"
  | "DB_SLOW_QUERY"
  | "HIGH_LATENCY";

export type BottleneckDiagnosis = {
  type: BottleneckType;
  severity: "WARNING" | "CRITICAL";
  resource: string;
  message: string;
  currentValue: number | string;
  threshold: number | string;
  mitigation: string;
  timestamp: string;
};

export type DevOpsMetricsSummary = {
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  uptimeSeconds: number;
  startedAt: string;
  totalRequests: number;
  successRequests: number;
  errorRequests: number;
  availabilityRatePercentage: number;
  slaTargetPercentage: number;
  overallLatency: LatencyPercentiles;
  routes: RouteMetricSummary[];
  database: DatabaseHealth;
  degradationAlerts: DegradationAlert[];
  resources: ApplicationResourceMetrics;
  bottlenecks: BottleneckDiagnosis[];
};

type EventLoopHistogram = ReturnType<typeof monitorEventLoopDelay>;
let eventLoopHistogram: EventLoopHistogram | null = null;
try {
  eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
  eventLoopHistogram.enable();
} catch {
  eventLoopHistogram = null;
}

export class DevOpsMetricsService {
  private static instance: DevOpsMetricsService;

  private readonly startedAt: Date;
  private readonly maxSamples: number;
  private readonly samples: RequestMetric[] = [];
  private readonly statusCounts: Record<string, number> = {
    "2xx": 0,
    "3xx": 0,
    "4xx": 0,
    "5xx": 0,
  };
  private totalRequests = 0;
  private attachedPool?: Pool;

  // Medição contínua de CPU
  private prevCpuUsage: NodeJS.CpuUsage = process.cpuUsage();
  private prevCpuTimestamp: number = performance.now();

  // Thresholds configuráveis de SLA e degradação
  public latencyWarningThresholdMs = 200; // > 200ms alerta atenção
  public latencyCriticalThresholdMs = 500; // > 500ms degradação crítica (SLA p95)
  public errorRateCriticalThresholdPercent = 5.0; // > 5% erro alerta crítico
  public slaTargetPercentage = 99.0; // RNF02: 99% de disponibilidade mínima

  // Thresholds de recursos e gargalos
  public memoryWarningPercent = 85.0;
  public memoryCriticalPercent = 92.0;
  public memoryCriticalMb = 500.0;
  public cpuWarningPercent = 80.0;
  public cpuCriticalPercent = 90.0;
  public eventLoopWarningLagMs = 50.0;
  public eventLoopCriticalLagMs = 100.0;
  public dbLatencyWarningMs = 500.0;
  public dbLatencyCriticalMs = 1000.0;

  constructor(maxSamples = 5000, clock = () => new Date()) {
    this.startedAt = clock();
    this.maxSamples = maxSamples;
  }

  public static getInstance(): DevOpsMetricsService {
    if (!DevOpsMetricsService.instance) {
      DevOpsMetricsService.instance = new DevOpsMetricsService();
    }
    return DevOpsMetricsService.instance;
  }

  public static resetInstance(): void {
    DevOpsMetricsService.instance = new DevOpsMetricsService();
  }

  public setDatabasePool(pool: Pool): void {
    this.attachedPool = pool;
  }

  /**
   * Registra a execução de uma requisição HTTP.
   */
  public recordRequest(metric: RequestMetric): void {
    this.totalRequests++;

    const category = `${Math.floor(metric.statusCode / 100)}xx`;
    if (category in this.statusCounts) {
      this.statusCounts[category] = (this.statusCounts[category] ?? 0) + 1;
    }

    if (this.samples.length >= this.maxSamples) {
      this.samples.shift();
    }
    this.samples.push(metric);
  }

  /**
   * Calcula percentis e estatísticas de latência sobre uma lista de amostras.
   */
  public calculatePercentiles(durations: number[]): LatencyPercentiles {
    if (durations.length === 0) {
      return {
        count: 0,
        mean: 0,
        min: 0,
        max: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    const mean = Number((sum / sorted.length).toFixed(2));
    const min = Number((sorted[0] ?? 0).toFixed(2));
    const max = Number((sorted[sorted.length - 1] ?? 0).toFixed(2));

    const getPercentile = (p: number) => {
      const idx = Math.min(
        Math.floor((p / 100) * sorted.length),
        sorted.length - 1,
      );
      return Number((sorted[idx] ?? 0).toFixed(2));
    };

    return {
      count: sorted.length,
      mean,
      min,
      max,
      p50: getPercentile(50),
      p95: getPercentile(95),
      p99: getPercentile(99),
    };
  }

  /**
   * Coleta métricas de consumo de recursos do processo e do sistema.
   */
  public collectResourceMetrics(pool?: Pool | Partial<DatabasePoolMetrics>): ApplicationResourceMetrics {
    // 1. Memória do Processo
    const mem = process.memoryUsage();
    const bytesToMb = (b: number) => Number((b / (1024 * 1024)).toFixed(2));
    const heapUsagePercent =
      mem.heapTotal > 0
        ? Number(((mem.heapUsed / mem.heapTotal) * 100).toFixed(2))
        : 0;

    const memory: ProcessMemoryMetrics = {
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      rssBytes: mem.rss,
      externalBytes: mem.external,
      heapUsedMb: bytesToMb(mem.heapUsed),
      heapTotalMb: bytesToMb(mem.heapTotal),
      rssMb: bytesToMb(mem.rss),
      heapUsagePercent,
    };

    // 2. CPU do Processo
    const currentCpu = process.cpuUsage();
    const currentTimestamp = performance.now();
    const deltaUser = currentCpu.user - this.prevCpuUsage.user;
    const deltaSystem = currentCpu.system - this.prevCpuUsage.system;
    const deltaTimeMs = Math.max(1, currentTimestamp - this.prevCpuTimestamp);

    let cpuPercent = 0;
    if (deltaTimeMs >= 100) {
      const totalCpuMicros = deltaUser + deltaSystem;
      const maxPossibleMicros = deltaTimeMs * 1000;
      const rawCpuPercent = (totalCpuMicros / maxPossibleMicros) * 100;
      cpuPercent = Number(
        Math.min(100, Math.max(0, rawCpuPercent)).toFixed(2),
      );
      this.prevCpuUsage = currentCpu;
      this.prevCpuTimestamp = currentTimestamp;
    }

    const cpu: ProcessCpuMetrics = {
      userMicroseconds: currentCpu.user,
      systemMicroseconds: currentCpu.system,
      cpuPercent,
    };

    // 3. Event Loop Lag
    let lagMs = 0;
    if (
      eventLoopHistogram &&
      !Number.isNaN(eventLoopHistogram.mean) &&
      Number.isFinite(eventLoopHistogram.mean)
    ) {
      lagMs = Number((eventLoopHistogram.mean / 1_000_000).toFixed(2));
    }
    const eventLoop: EventLoopMetrics = {
      lagMs,
      status:
        lagMs >= this.eventLoopCriticalLagMs
          ? "CRITICAL"
          : lagMs >= this.eventLoopWarningLagMs
            ? "WARNING"
            : "NORMAL",
    };

    // 4. Pool de Conexões com PostgreSQL
    const targetPool = pool ?? this.attachedPool;
    let databasePool: DatabasePoolMetrics;

    if (
      targetPool &&
      typeof targetPool === "object" &&
      "totalConnections" in targetPool
    ) {
      databasePool = targetPool as DatabasePoolMetrics;
    } else if (
      targetPool &&
      typeof targetPool === "object" &&
      "totalCount" in (targetPool as unknown as Record<string, unknown>)
    ) {
      const p = targetPool as unknown as {
        totalCount: number;
        idleCount: number;
        waitingCount: number;
      };
      const total = p.totalCount ?? 0;
      const idle = p.idleCount ?? 0;
      const waiting = p.waitingCount ?? 0;
      const active = Math.max(0, total - idle);
      databasePool = {
        totalConnections: total,
        idleConnections: idle,
        activeConnections: active,
        waitingClients: waiting,
      };
    } else {
      databasePool = {
        totalConnections: 0,
        idleConnections: 0,
        activeConnections: 0,
        waitingClients: 0,
      };
    }

    // 5. Recursos do Sistema Operacional
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = Math.max(0, totalMem - freeMem);
    const loadAvg = os.loadavg();

    const system: SystemResourceMetrics = {
      totalMemoryBytes: totalMem,
      freeMemoryBytes: freeMem,
      usedMemoryBytes: usedMem,
      memoryUsagePercent:
        totalMem > 0 ? Number(((usedMem / totalMem) * 100).toFixed(2)) : 0,
      cpuCores: os.cpus().length,
      loadAverage1m: Number((loadAvg[0] ?? 0).toFixed(2)),
    };

    return {
      memory,
      cpu,
      eventLoop,
      databasePool,
      system,
    };
  }

  /**
   * Analisa as métricas de recursos e desempenho para detectar gargalos operacionais.
   */
  public detectBottlenecks(
    resources: ApplicationResourceMetrics,
    databaseHealth: DatabaseHealth,
    overallLatency: LatencyPercentiles,
  ): BottleneckDiagnosis[] {
    const bottlenecks: BottleneckDiagnosis[] = [];

    // 1. Gargalo de Memória
    if (
      resources.memory.heapUsagePercent >= this.memoryWarningPercent ||
      resources.memory.heapUsedMb >= this.memoryCriticalMb
    ) {
      const isCritical =
        resources.memory.heapUsagePercent >= this.memoryCriticalPercent ||
        resources.memory.heapUsedMb >= this.memoryCriticalMb;
      bottlenecks.push({
        type: "HIGH_MEMORY",
        severity: isCritical ? "CRITICAL" : "WARNING",
        resource: "Node.js V8 Heap",
        message: `Consumo elevado de heap (${resources.memory.heapUsedMb} MB de ${resources.memory.heapTotalMb} MB - ${resources.memory.heapUsagePercent}%)`,
        currentValue: `${resources.memory.heapUsagePercent}%`,
        threshold: `${this.memoryWarningPercent}%`,
        mitigation:
          "Investigar possíveis vazamentos de memória (retenção de referências ou listeners) e considerar ajuste de --max-old-space-size.",
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Gargalo de CPU
    if (resources.cpu.cpuPercent >= this.cpuWarningPercent) {
      const isCritical = resources.cpu.cpuPercent >= this.cpuCriticalPercent;
      bottlenecks.push({
        type: "CPU_SATURATION",
        severity: isCritical ? "CRITICAL" : "WARNING",
        resource: "Node.js Process CPU",
        message: `Uso excessivo de CPU do processo (${resources.cpu.cpuPercent}%)`,
        currentValue: `${resources.cpu.cpuPercent}%`,
        threshold: `${this.cpuWarningPercent}%`,
        mitigation:
          "Identificar loops intensivos, parsing de grandes payloads síncronos ou expressões regulares catastróficas.",
        timestamp: new Date().toISOString(),
      });
    }

    // 3. Gargalo de Event Loop (Travamento de Thread Node.js)
    if (resources.eventLoop.lagMs >= this.eventLoopWarningLagMs) {
      const isCritical =
        resources.eventLoop.lagMs >= this.eventLoopCriticalLagMs;
      bottlenecks.push({
        type: "EVENT_LOOP_BLOCKED",
        severity: isCritical ? "CRITICAL" : "WARNING",
        resource: "Node.js Event Loop",
        message: `Atraso no Event Loop (${resources.eventLoop.lagMs} ms)`,
        currentValue: `${resources.eventLoop.lagMs} ms`,
        threshold: `${this.eventLoopWarningLagMs} ms`,
        mitigation:
          "Evitar chamadas bloqueantes síncronas na thread principal do Node.js e delegar tarefas computacionais pesadas a workers.",
        timestamp: new Date().toISOString(),
      });
    }

    // 4. Gargalo de Pool do PostgreSQL
    if (
      resources.databasePool.waitingClients > 0 ||
      (resources.databasePool.totalConnections >= 10 &&
        resources.databasePool.idleConnections === 0)
    ) {
      bottlenecks.push({
        type: "DB_POOL_SATURATION",
        severity:
          resources.databasePool.waitingClients > 0 ? "CRITICAL" : "WARNING",
        resource: "PostgreSQL Connection Pool",
        message: `Pool de conexões saturado (${resources.databasePool.waitingClients} clientes em espera, ${resources.databasePool.activeConnections} ativas)`,
        currentValue:
          resources.databasePool.waitingClients > 0
            ? `${resources.databasePool.waitingClients} em espera`
            : "0 ociosas",
        threshold: "0 clientes em espera",
        mitigation:
          "Aumentar o limite de conexões no pool do banco ou otimizar consultas que mantêm conexões abertas por tempo prolongado.",
        timestamp: new Date().toISOString(),
      });
    }

    // 5. Gargalo de Latência de Banco de Dados
    if (
      databaseHealth.latencyMs !== undefined &&
      databaseHealth.latencyMs >= this.dbLatencyWarningMs
    ) {
      const isCritical = databaseHealth.latencyMs >= this.dbLatencyCriticalMs;
      bottlenecks.push({
        type: "DB_SLOW_QUERY",
        severity: isCritical ? "CRITICAL" : "WARNING",
        resource: "PostgreSQL Database Latency",
        message: `Latência de ping no banco elevada (${databaseHealth.latencyMs} ms)`,
        currentValue: `${databaseHealth.latencyMs} ms`,
        threshold: `${this.dbLatencyWarningMs} ms`,
        mitigation:
          "Verificar contenção de I/O de disco no banco de dados, locks de transações ativos e índices das tabelas.",
        timestamp: new Date().toISOString(),
      });
    }

    // 6. Gargalo de Latência Global de Aplicação
    if (overallLatency.p95 >= this.latencyCriticalThresholdMs) {
      bottlenecks.push({
        type: "HIGH_LATENCY",
        severity: "CRITICAL",
        resource: "Application HTTP Latency",
        message: `Latência p95 global de ${overallLatency.p95} ms acima do limiar crítico (${this.latencyCriticalThresholdMs} ms)`,
        currentValue: `${overallLatency.p95} ms`,
        threshold: `${this.latencyCriticalThresholdMs} ms`,
        mitigation:
          "Avaliar endpoints com status DEGRADED e habilitar cache ou otimização de consultas.",
        timestamp: new Date().toISOString(),
      });
    }

    return bottlenecks;
  }

  /**
   * Retorna resumo estruturado em JSON com status, recursos, percentis, alertas e gargalos.
   */
  public getSummary(
    databaseHealth: DatabaseHealth = { status: "UP" },
    poolOrResources?: Pool | Partial<ApplicationResourceMetrics>,
  ): DevOpsMetricsSummary {
    const uptimeSeconds = Math.floor(
      (Date.now() - this.startedAt.getTime()) / 1000,
    );
    const successRequests =
      (this.statusCounts["2xx"] ?? 0) + (this.statusCounts["3xx"] ?? 0);
    const errorRequests =
      (this.statusCounts["4xx"] ?? 0) + (this.statusCounts["5xx"] ?? 0);
    const serverErrors = this.statusCounts["5xx"] ?? 0;

    // Disponibilidade considera falhas de servidor (5xx) versus total de requisições
    const availabilityRatePercentage =
      this.totalRequests > 0
        ? Number(
            (
              ((this.totalRequests - serverErrors) / this.totalRequests) *
              100
            ).toFixed(2),
          )
        : 100.0;

    const allDurations = this.samples.map((s) => s.durationMs);
    const overallLatency = this.calculatePercentiles(allDurations);

    // Coleta de Recursos
    let resources: ApplicationResourceMetrics;
    const isCustomResources =
      poolOrResources &&
      typeof poolOrResources === "object" &&
      ("memory" in poolOrResources ||
        "cpu" in poolOrResources ||
        "eventLoop" in poolOrResources ||
        "databasePool" in poolOrResources ||
        "system" in poolOrResources);

    if (isCustomResources) {
      const defaultRes = this.collectResourceMetrics();
      const custom = poolOrResources as Partial<ApplicationResourceMetrics>;
      resources = {
        memory: custom.memory ? { ...defaultRes.memory, ...custom.memory } : defaultRes.memory,
        cpu: custom.cpu ? { ...defaultRes.cpu, ...custom.cpu } : defaultRes.cpu,
        eventLoop: custom.eventLoop ? { ...defaultRes.eventLoop, ...custom.eventLoop } : defaultRes.eventLoop,
        databasePool: custom.databasePool ? { ...defaultRes.databasePool, ...custom.databasePool } : defaultRes.databasePool,
        system: custom.system ? { ...defaultRes.system, ...custom.system } : defaultRes.system,
      };
    } else {
      resources = this.collectResourceMetrics(poolOrResources as Pool | undefined);
    }

    // Detecção de Gargalos
    const bottlenecks = this.detectBottlenecks(
      resources,
      databaseHealth,
      overallLatency,
    );

    // Métricas por rota
    const routeGroups = new Map<string, RequestMetric[]>();
    for (const sample of this.samples) {
      const key = `${sample.method} ${sample.route}`;
      const group = routeGroups.get(key) ?? [];
      group.push(sample);
      routeGroups.set(key, group);
    }

    const degradationAlerts: DegradationAlert[] = [];
    const routes: RouteMetricSummary[] = [];

    for (const [key, samples] of routeGroups.entries()) {
      const [method, route] = key.split(" ");
      const routeDurations = samples.map((s) => s.durationMs);
      const latency = this.calculatePercentiles(routeDurations);
      const errors = samples.filter((s) => s.statusCode >= 500).length;

      const isRouteDegraded =
        latency.p95 >= this.latencyCriticalThresholdMs ||
        (samples.length >= 10 &&
          (errors / samples.length) * 100 >=
            this.errorRateCriticalThresholdPercent);

      if (latency.p95 >= this.latencyCriticalThresholdMs) {
        degradationAlerts.push({
          severity: "CRITICAL",
          type: "HIGH_LATENCY",
          message: `Rota ${key} apresentando p95 de ${latency.p95}ms (limiar: ${this.latencyCriticalThresholdMs}ms)`,
          target: key,
          currentValue: latency.p95,
          threshold: this.latencyCriticalThresholdMs,
          timestamp: new Date().toISOString(),
        });
      }

      routes.push({
        method: method ?? "GET",
        route: route ?? key,
        totalRequests: samples.length,
        errorCount: errors,
        latency,
        status: isRouteDegraded ? "DEGRADED" : "NORMAL",
      });
    }

    // Alerta de degradação global de latência
    if (overallLatency.p95 >= this.latencyCriticalThresholdMs) {
      degradationAlerts.push({
        severity: "CRITICAL",
        type: "HIGH_LATENCY",
        message: `Latência global p95 elevada: ${overallLatency.p95}ms (limiar: ${this.latencyCriticalThresholdMs}ms)`,
        currentValue: overallLatency.p95,
        threshold: this.latencyCriticalThresholdMs,
        timestamp: new Date().toISOString(),
      });
    } else if (overallLatency.mean >= this.latencyWarningThresholdMs) {
      degradationAlerts.push({
        severity: "WARNING",
        type: "HIGH_LATENCY",
        message: `Latência global média em atenção: ${overallLatency.mean}ms (limiar: ${this.latencyWarningThresholdMs}ms)`,
        currentValue: overallLatency.mean,
        threshold: this.latencyWarningThresholdMs,
        timestamp: new Date().toISOString(),
      });
    }

    // Alerta de taxa de erro de servidor
    if (this.totalRequests >= 20) {
      const errorRate = (serverErrors / this.totalRequests) * 100;
      if (errorRate >= this.errorRateCriticalThresholdPercent) {
        degradationAlerts.push({
          severity: "CRITICAL",
          type: "HIGH_ERROR_RATE",
          message: `Taxa de erros de servidor crítica: ${errorRate.toFixed(2)}% (limiar: ${this.errorRateCriticalThresholdPercent}%)`,
          currentValue: Number(errorRate.toFixed(2)),
          threshold: this.errorRateCriticalThresholdPercent,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Alerta de banco de dados
    if (databaseHealth.status === "DOWN") {
      degradationAlerts.push({
        severity: "CRITICAL",
        type: "DATABASE_DOWN",
        message: `Conexão com PostgreSQL indisponível: ${databaseHealth.error ?? "Falha de conexão"}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Alertas a partir dos gargalos críticos de recursos
    for (const bn of bottlenecks) {
      if (bn.severity === "CRITICAL" && bn.type !== "HIGH_LATENCY") {
        degradationAlerts.push({
          severity: "CRITICAL",
          type: "RESOURCE_EXHAUSTION",
          message: `${bn.resource}: ${bn.message}`,
          currentValue: bn.currentValue,
          threshold: bn.threshold,
          timestamp: bn.timestamp,
        });
      }
    }

    // Determina o status geral
    let status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" = "HEALTHY";
    const hasFatalResource =
      resources.memory.heapUsagePercent >= this.memoryCriticalPercent;

    if (
      databaseHealth.status === "DOWN" ||
      availabilityRatePercentage < this.slaTargetPercentage ||
      hasFatalResource
    ) {
      status = "UNHEALTHY";
    } else if (
      databaseHealth.status === "DEGRADED" ||
      degradationAlerts.some(
        (a) => a.severity === "CRITICAL" || a.severity === "WARNING",
      ) ||
      bottlenecks.length > 0
    ) {
      status = "DEGRADED";
    }

    return {
      status,
      uptimeSeconds,
      startedAt: this.startedAt.toISOString(),
      totalRequests: this.totalRequests,
      successRequests,
      errorRequests,
      availabilityRatePercentage,
      slaTargetPercentage: this.slaTargetPercentage,
      overallLatency,
      routes,
      database: databaseHealth,
      degradationAlerts,
      resources,
      bottlenecks,
    };
  }

  /**
   * Converte as métricas para o formato padrão do Prometheus (OpenMetrics).
   */
  public toPrometheusMetrics(
    databaseHealth: DatabaseHealth = { status: "UP" },
    poolOrResources?: Pool | Partial<ApplicationResourceMetrics>,
  ): string {
    const summary = this.getSummary(databaseHealth, poolOrResources);
    const dbValue =
      databaseHealth.status === "UP"
        ? 1
        : databaseHealth.status === "DEGRADED"
          ? 0.5
          : 0;
    const systemStatusVal =
      summary.status === "HEALTHY"
        ? 1
        : summary.status === "DEGRADED"
          ? 0.5
          : 0;

    const lines: string[] = [
      "# HELP vulture_uptime_seconds Tempo em segundos desde que a aplicacao foi iniciada.",
      "# TYPE vulture_uptime_seconds gauge",
      `vulture_uptime_seconds ${summary.uptimeSeconds}`,
      "",
      "# HELP vulture_service_status Status operacional do servico (1 = HEALTHY, 0.5 = DEGRADED, 0 = UNHEALTHY).",
      "# TYPE vulture_service_status gauge",
      `vulture_service_status ${systemStatusVal}`,
      "",
      "# HELP vulture_availability_ratio_percentage Percentual acumulado de disponibilidade (SLA).",
      "# TYPE vulture_availability_ratio_percentage gauge",
      `vulture_availability_ratio_percentage ${summary.availabilityRatePercentage}`,
      "",
      "# HELP vulture_http_requests_total Total de requisicoes HTTP atendidas.",
      "# TYPE vulture_http_requests_total counter",
      `vulture_http_requests_total{status="2xx"} ${this.statusCounts["2xx"] ?? 0}`,
      `vulture_http_requests_total{status="3xx"} ${this.statusCounts["3xx"] ?? 0}`,
      `vulture_http_requests_total{status="4xx"} ${this.statusCounts["4xx"] ?? 0}`,
      `vulture_http_requests_total{status="5xx"} ${this.statusCounts["5xx"] ?? 0}`,
      "",
      "# HELP vulture_http_response_time_ms Latencia das respostas HTTP em milissegundos.",
      "# TYPE vulture_http_response_time_ms gauge",
      `vulture_http_response_time_ms{quantile="0.50"} ${summary.overallLatency.p50}`,
      `vulture_http_response_time_ms{quantile="0.95"} ${summary.overallLatency.p95}`,
      `vulture_http_response_time_ms{quantile="0.99"} ${summary.overallLatency.p99}`,
      `vulture_http_response_time_ms{metric="mean"} ${summary.overallLatency.mean}`,
      `vulture_http_response_time_ms{metric="min"} ${summary.overallLatency.min}`,
      `vulture_http_response_time_ms{metric="max"} ${summary.overallLatency.max}`,
      "",
      "# HELP vulture_database_status Estado de conexao com o banco de dados relacional PostgreSQL.",
      "# TYPE vulture_database_status gauge",
      `vulture_database_status ${dbValue}`,
    ];

    if (databaseHealth.latencyMs !== undefined) {
      lines.push(
        "# HELP vulture_database_ping_latency_ms Tempo de resposta do ping SQL no PostgreSQL.",
        "# TYPE vulture_database_ping_latency_ms gauge",
        `vulture_database_ping_latency_ms ${databaseHealth.latencyMs}`,
      );
    }

    lines.push(
      "",
      "# HELP vulture_degradations_active Quantidade de alertas de degradacao ou anomalias ativas.",
      "# TYPE vulture_degradations_active gauge",
      `vulture_degradations_active ${summary.degradationAlerts.length}`,
      "",
      "# HELP vulture_process_memory_heap_used_bytes Memoria heap em uso efetivo pelo processo Node.js.",
      "# TYPE vulture_process_memory_heap_used_bytes gauge",
      `vulture_process_memory_heap_used_bytes ${summary.resources.memory.heapUsedBytes}`,
      "",
      "# HELP vulture_process_memory_heap_total_bytes Memoria heap total alocada pela V8.",
      "# TYPE vulture_process_memory_heap_total_bytes gauge",
      `vulture_process_memory_heap_total_bytes ${summary.resources.memory.heapTotalBytes}`,
      "",
      "# HELP vulture_process_memory_rss_bytes Memoria fisica total (Resident Set Size) em bytes.",
      "# TYPE vulture_process_memory_rss_bytes gauge",
      `vulture_process_memory_rss_bytes ${summary.resources.memory.rssBytes}`,
      "",
      "# HELP vulture_process_memory_external_bytes Memoria externa alocada por estruturas C++ do Node.js em bytes.",
      "# TYPE vulture_process_memory_external_bytes gauge",
      `vulture_process_memory_external_bytes ${summary.resources.memory.externalBytes}`,
      "",
      "# HELP vulture_process_memory_heap_usage_percent Percentual de utilizacao da memoria heap V8.",
      "# TYPE vulture_process_memory_heap_usage_percent gauge",
      `vulture_process_memory_heap_usage_percent ${summary.resources.memory.heapUsagePercent}`,
      "",
      "# HELP vulture_process_cpu_usage_percent Estimativa percentual de utilizacao de CPU do processo Node.js.",
      "# TYPE vulture_process_cpu_usage_percent gauge",
      `vulture_process_cpu_usage_percent ${summary.resources.cpu.cpuPercent}`,
      "",
      "# HELP vulture_process_cpu_user_seconds_total Tempo acumulado de CPU em modo usuario em segundos.",
      "# TYPE vulture_process_cpu_user_seconds_total counter",
      `vulture_process_cpu_user_seconds_total ${(summary.resources.cpu.userMicroseconds / 1_000_000).toFixed(4)}`,
      "",
      "# HELP vulture_process_cpu_system_seconds_total Tempo acumulado de CPU em modo sistema em segundos.",
      "# TYPE vulture_process_cpu_system_seconds_total counter",
      `vulture_process_cpu_system_seconds_total ${(summary.resources.cpu.systemMicroseconds / 1_000_000).toFixed(4)}`,
      "",
      "# HELP vulture_event_loop_lag_ms Atraso medio do Event Loop do Node.js em milissegundos.",
      "# TYPE vulture_event_loop_lag_ms gauge",
      `vulture_event_loop_lag_ms ${summary.resources.eventLoop.lagMs}`,
      "",
      "# HELP vulture_database_pool_total_connections Quantidade total de conexoes alocadas no pool do PostgreSQL.",
      "# TYPE vulture_database_pool_total_connections gauge",
      `vulture_database_pool_total_connections ${summary.resources.databasePool.totalConnections}`,
      "",
      "# HELP vulture_database_pool_idle_connections Quantidade de conexoes ociosas disponiveis no pool.",
      "# TYPE vulture_database_pool_idle_connections gauge",
      `vulture_database_pool_idle_connections ${summary.resources.databasePool.idleConnections}`,
      "",
      "# HELP vulture_database_pool_active_connections Quantidade de conexoes em uso ativo no pool.",
      "# TYPE vulture_database_pool_active_connections gauge",
      `vulture_database_pool_active_connections ${summary.resources.databasePool.activeConnections}`,
      "",
      "# HELP vulture_database_pool_waiting_clients Quantidade de requisicoes aguardando conexao livre no pool.",
      "# TYPE vulture_database_pool_waiting_clients gauge",
      `vulture_database_pool_waiting_clients ${summary.resources.databasePool.waitingClients}`,
      "",
      "# HELP vulture_system_memory_used_bytes Memoria utilizada no sistema operacional em bytes.",
      "# TYPE vulture_system_memory_used_bytes gauge",
      `vulture_system_memory_used_bytes ${summary.resources.system.usedMemoryBytes}`,
      "",
      "# HELP vulture_system_memory_total_bytes Memoria total disponivel no sistema operacional em bytes.",
      "# TYPE vulture_system_memory_total_bytes gauge",
      `vulture_system_memory_total_bytes ${summary.resources.system.totalMemoryBytes}`,
      "",
      "# HELP vulture_system_cpu_load_1m Carga media da CPU do sistema nos ultimos 60 segundos.",
      "# TYPE vulture_system_cpu_load_1m gauge",
      `vulture_system_cpu_load_1m ${summary.resources.system.loadAverage1m}`,
      "",
      "# HELP vulture_bottlenecks_detected_total Quantidade total de gargalos operacionais diagnosticados.",
      "# TYPE vulture_bottlenecks_detected_total gauge",
      `vulture_bottlenecks_detected_total ${summary.bottlenecks.length}`,
      "",
    );

    return lines.join("\n");
  }
}
