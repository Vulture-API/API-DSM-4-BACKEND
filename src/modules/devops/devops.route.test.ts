import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "@/app.js";
import { FakePermissionRepository } from "@/modules/permissions/testing/fake-permission.repository.js";
import { FakeRoleRepository } from "@/modules/roles/testing/fake-role.repository.js";

import { DevOpsMetricsService } from "./devops-metrics.service.js";

describe("DevOps Routes Integration", () => {
  let metricsService: DevOpsMetricsService;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    metricsService = new DevOpsMetricsService();
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
    } as unknown as Pool;

    app = buildApp({
      database: mockPool,
      accessControlEnabled: false,
      permissionRepository: new FakePermissionRepository(
        new FakeRoleRepository(),
      ),
      devopsMetricsService: metricsService,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("GET /metrics returns Prometheus formatted metrics", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/metrics",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("vulture_uptime_seconds");
    expect(response.body).toContain("vulture_service_status");
    expect(response.body).toContain("vulture_http_requests_total");
  });

  it("GET /health/detailed returns JSON with availability, latency percentiles and status", async () => {
    // Faz algumas requisições para gerar métricas
    await app.inject({ method: "GET", url: "/" });
    await app.inject({ method: "GET", url: "/health" });

    const response = await app.inject({
      method: "GET",
      url: "/health/detailed",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("uptimeSeconds");
    expect(body).toHaveProperty("availabilityRatePercentage");
    expect(body).toHaveProperty("overallLatency");
    expect(body.overallLatency).toHaveProperty("mean");
    expect(body.overallLatency).toHaveProperty("p50");
    expect(body.overallLatency).toHaveProperty("p95");
    expect(body.overallLatency).toHaveProperty("p99");
    expect(body.totalRequests).toBeGreaterThanOrEqual(2);
  });

  it("GET /api/devops/metrics returns identical detailed metrics for monitoring", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/devops/metrics",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("HEALTHY");
    expect(body.availabilityRatePercentage).toBe(100);
  });

  it("GET /api/devops/ping returns pong", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/devops/ping",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("pong");
    expect(body).toHaveProperty("timestamp");
  });

  it("GET /api/devops/resources returns application resources and bottleneck diagnoses", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/devops/resources",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty("resources");
    expect(body.resources).toHaveProperty("memory");
    expect(body.resources.memory).toHaveProperty("heapUsedMb");
    expect(body.resources.memory).toHaveProperty("rssMb");
    expect(body.resources).toHaveProperty("cpu");
    expect(body.resources.cpu).toHaveProperty("cpuPercent");
    expect(body.resources).toHaveProperty("eventLoop");
    expect(body.resources.eventLoop).toHaveProperty("lagMs");
    expect(body.resources).toHaveProperty("databasePool");
    expect(body.resources).toHaveProperty("system");
    expect(body).toHaveProperty("bottlenecks");
    expect(Array.isArray(body.bottlenecks)).toBe(true);
  });
});
