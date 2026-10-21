import { describe, expect, it } from "vitest";

import { DevOpsMetricsService } from "./devops-metrics.service.js";

describe("DevOpsMetricsService", () => {
  it("initializes with zero requests and 100% availability", () => {
    const service = new DevOpsMetricsService(
      100,
      () => new Date("2026-10-20T10:00:00Z"),
    );
    const summary = service.getSummary();

    expect(summary.status).toBe("HEALTHY");
    expect(summary.totalRequests).toBe(0);
    expect(summary.availabilityRatePercentage).toBe(100);
    expect(summary.degradationAlerts).toHaveLength(0);
  });

  it("calculates accurate latency percentiles (min, max, mean, p50, p95, p99)", () => {
    const service = new DevOpsMetricsService();
    // 100 amostras com durações de 1ms até 100ms
    const durations = Array.from({ length: 100 }, (_, i) => i + 1);
    const percentiles = service.calculatePercentiles(durations);

    expect(percentiles.count).toBe(100);
    expect(percentiles.min).toBe(1);
    expect(percentiles.max).toBe(100);
    expect(percentiles.mean).toBe(50.5);
    expect(percentiles.p50).toBe(51);
    expect(percentiles.p95).toBe(96);
    expect(percentiles.p99).toBe(100);
  });

  it("handles empty durations gracefully", () => {
    const service = new DevOpsMetricsService();
    const percentiles = service.calculatePercentiles([]);

    expect(percentiles.count).toBe(0);
    expect(percentiles.mean).toBe(0);
    expect(percentiles.p50).toBe(0);
  });

  it("computes availability percentage considering 5xx errors", () => {
    const service = new DevOpsMetricsService();

    // 95 requisições 200 OK e 5 requisições 500 Internal Error
    for (let i = 0; i < 95; i++) {
      service.recordRequest({
        method: "GET",
        route: "/api/stations",
        statusCode: 200,
        durationMs: 45,
        timestamp: Date.now(),
      });
    }
    for (let i = 0; i < 5; i++) {
      service.recordRequest({
        method: "GET",
        route: "/api/stations",
        statusCode: 500,
        durationMs: 50,
        timestamp: Date.now(),
      });
    }

    const summary = service.getSummary();
    expect(summary.totalRequests).toBe(100);
    expect(summary.successRequests).toBe(95);
    expect(summary.availabilityRatePercentage).toBe(95.0);
  });

  it("detects performance degradation when p95 exceeds latency critical threshold", () => {
    const service = new DevOpsMetricsService();
    service.latencyCriticalThresholdMs = 300;

    // Injeta 100 requisições normais (50ms) e requisições lentas (600ms)
    for (let i = 0; i < 90; i++) {
      service.recordRequest({
        method: "GET",
        route: "/api/reports",
        statusCode: 200,
        durationMs: 50,
        timestamp: Date.now(),
      });
    }
    for (let i = 0; i < 10; i++) {
      service.recordRequest({
        method: "GET",
        route: "/api/reports",
        statusCode: 200,
        durationMs: 650,
        timestamp: Date.now(),
      });
    }

    const summary = service.getSummary();
    expect(summary.status).toBe("DEGRADED");
    expect(
      summary.degradationAlerts.some((a) => a.type === "HIGH_LATENCY"),
    ).toBe(true);

    const routeReport = summary.routes.find((r) => r.route === "/api/reports");
    expect(routeReport?.status).toBe("DEGRADED");
    expect(routeReport?.latency.p95).toBeGreaterThanOrEqual(300);
  });

  it("detects database down and marks status as UNHEALTHY", () => {
    const service = new DevOpsMetricsService();
    const summary = service.getSummary({
      status: "DOWN",
      error: "Connection timeout to PostgreSQL",
    });

    expect(summary.status).toBe("UNHEALTHY");
    expect(summary.database.status).toBe("DOWN");
    expect(
      summary.degradationAlerts.some((a) => a.type === "DATABASE_DOWN"),
    ).toBe(true);
  });

  it("generates valid Prometheus metrics output", () => {
    const service = new DevOpsMetricsService();
    service.recordRequest({
      method: "GET",
      route: "/health",
      statusCode: 200,
      durationMs: 15.5,
      timestamp: Date.now(),
    });

    const prometheusText = service.toPrometheusMetrics({
      status: "UP",
      latencyMs: 3.2,
    });

    expect(prometheusText).toContain("# HELP vulture_uptime_seconds");
    expect(prometheusText).toContain("vulture_service_status 1");
    expect(prometheusText).toContain(
      'vulture_http_requests_total{status="2xx"} 1',
    );
    expect(prometheusText).toContain(
      'vulture_http_response_time_ms{quantile="0.50"} 15.5',
    );
    expect(prometheusText).toContain("vulture_database_status 1");
    expect(prometheusText).toContain("vulture_database_ping_latency_ms 3.2");
    expect(prometheusText).toContain("vulture_process_memory_heap_used_bytes");
    expect(prometheusText).toContain("vulture_process_cpu_usage_percent");
    expect(prometheusText).toContain("vulture_event_loop_lag_ms");
    expect(prometheusText).toContain("vulture_database_pool_total_connections");
    expect(prometheusText).toContain("vulture_bottlenecks_detected_total");
  });

  it("collects application and system resource metrics properly", () => {
    const service = new DevOpsMetricsService();
    const mockPool = {
      totalCount: 15,
      idleCount: 10,
      waitingCount: 2,
    };

    const resources = service.collectResourceMetrics(mockPool as any);

    expect(resources.memory.heapUsedBytes).toBeGreaterThan(0);
    expect(resources.memory.heapTotalBytes).toBeGreaterThan(0);
    expect(resources.memory.heapUsagePercent).toBeGreaterThanOrEqual(0);
    expect(resources.memory.heapUsagePercent).toBeLessThanOrEqual(100);

    expect(resources.cpu.cpuPercent).toBeGreaterThanOrEqual(0);
    expect(resources.cpu.cpuPercent).toBeLessThanOrEqual(100);

    expect(resources.eventLoop.lagMs).toBeGreaterThanOrEqual(0);
    expect(["NORMAL", "WARNING", "CRITICAL"]).toContain(resources.eventLoop.status);

    expect(resources.databasePool.totalConnections).toBe(15);
    expect(resources.databasePool.idleConnections).toBe(10);
    expect(resources.databasePool.activeConnections).toBe(5);
    expect(resources.databasePool.waitingClients).toBe(2);

    expect(resources.system.totalMemoryBytes).toBeGreaterThan(0);
    expect(resources.system.cpuCores).toBeGreaterThan(0);
  });

  it("detects high memory usage bottleneck", () => {
    const service = new DevOpsMetricsService();
    const summary = service.getSummary(
      { status: "UP" },
      {
        memory: {
          heapUsedBytes: 950 * 1024 * 1024,
          heapTotalBytes: 1000 * 1024 * 1024,
          rssBytes: 1100 * 1024 * 1024,
          externalBytes: 10 * 1024 * 1024,
          heapUsedMb: 950,
          heapTotalMb: 1000,
          rssMb: 1100,
          heapUsagePercent: 95.0,
        },
      },
    );

    expect(summary.status).toBe("UNHEALTHY");
    const memBottleneck = summary.bottlenecks.find((b) => b.type === "HIGH_MEMORY");
    expect(memBottleneck).toBeDefined();
    expect(memBottleneck?.severity).toBe("CRITICAL");
    expect(memBottleneck?.mitigation).toContain("memória");
  });

  it("detects CPU saturation and event loop lag bottlenecks", () => {
    const service = new DevOpsMetricsService();
    const summary = service.getSummary(
      { status: "UP" },
      {
        cpu: {
          userMicroseconds: 500000,
          systemMicroseconds: 400000,
          cpuPercent: 88.5,
        },
        eventLoop: {
          lagMs: 75.2,
          status: "WARNING",
        },
      },
    );

    expect(summary.status).toBe("DEGRADED");
    expect(summary.bottlenecks.some((b) => b.type === "CPU_SATURATION")).toBe(true);
    expect(summary.bottlenecks.some((b) => b.type === "EVENT_LOOP_BLOCKED")).toBe(true);
  });

  it("detects PostgreSQL connection pool saturation bottleneck", () => {
    const service = new DevOpsMetricsService();
    const summary = service.getSummary(
      { status: "UP" },
      {
        databasePool: {
          totalConnections: 20,
          idleConnections: 0,
          activeConnections: 20,
          waitingClients: 8,
        },
      },
    );

    expect(summary.status).toBe("DEGRADED");
    const poolBottleneck = summary.bottlenecks.find((b) => b.type === "DB_POOL_SATURATION");
    expect(poolBottleneck).toBeDefined();
    expect(poolBottleneck?.severity).toBe("CRITICAL");
    expect(poolBottleneck?.currentValue).toContain("8 em espera");
  });
});
