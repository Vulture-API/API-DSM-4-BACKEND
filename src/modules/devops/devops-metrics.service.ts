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
  type: "HIGH_LATENCY" | "HIGH_ERROR_RATE" | "DATABASE_DOWN";
  message: string;
  target?: string;
  currentValue?: number;
  threshold?: number;
  timestamp: string;
};

export type DatabaseHealth = {
  status: "UP" | "DEGRADED" | "DOWN";
  latencyMs?: number;
  error?: string;
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
};

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

  // Thresholds configuráveis de SLA e degradação
  public latencyWarningThresholdMs = 200; // > 200ms alerta atenção
  public latencyCriticalThresholdMs = 500; // > 500ms degradação crítica (SLA p95)
  public errorRateCriticalThresholdPercent = 5.0; // > 5% erro alerta crítico
  public slaTargetPercentage = 99.0; // RNF02: 99% de disponibilidade mínima

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
   * Retorna resumo estruturado em JSON com status, disponibilidade, percentis e alertas.
   */
  public getSummary(
    databaseHealth: DatabaseHealth = { status: "UP" },
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

    // Determina o status geral
    let status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" = "HEALTHY";
    if (
      databaseHealth.status === "DOWN" ||
      availabilityRatePercentage < this.slaTargetPercentage
    ) {
      status = "UNHEALTHY";
    } else if (
      databaseHealth.status === "DEGRADED" ||
      degradationAlerts.some(
        (a) => a.severity === "CRITICAL" || a.severity === "WARNING",
      )
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
    };
  }

  /**
   * Converte as métricas para o formato padrão do Prometheus (OpenMetrics).
   */
  public toPrometheusMetrics(
    databaseHealth: DatabaseHealth = { status: "UP" },
  ): string {
    const summary = this.getSummary(databaseHealth);
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
    );

    return lines.join("\n");
  }
}
