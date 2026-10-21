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
  });
});
