import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "@/app.js";
import { FakePermissionRepository } from "@/modules/permissions/testing/fake-permission.repository.js";
import { FakeRoleRepository } from "@/modules/roles/testing/fake-role.repository.js";

import { DevOpsMetricsService } from "./devops-metrics.service.js";
import { DevOpsOutageService } from "./devops-outage.service.js";
import { InMemorySystemOutageRepository } from "./system-outage.repository.js";

describe("DevOps Outage & SLA Routes Integration", () => {
  let app: ReturnType<typeof buildApp>;
  let repository: InMemorySystemOutageRepository;
  let outageService: DevOpsOutageService;
  let metricsService: DevOpsMetricsService;

  beforeEach(() => {
    repository = new InMemorySystemOutageRepository();
    outageService = new DevOpsOutageService(repository);
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
      outageRepository: repository,
      outageService,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST /api/devops/outages registers a new outage and returns 201", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/devops/outages",
      payload: {
        service: "api-backend",
        severity: "CRITICAL",
        reason: "Erro fatal no processo Node.js por falta de memória",
        failureDetails: {
          error: "JavaScript heap out of memory",
          httpStatus: 500,
          detectionSource: "METRICS_ALERT",
        },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toHaveProperty("id");
    expect(body.service).toBe("api-backend");
    expect(body.status).toBe("OPEN");
    expect(body.severity).toBe("CRITICAL");
    expect(body.failureDetails.error).toContain("heap out of memory");
  });

  it("GET /api/devops/outages lists registered outages with filter support", async () => {
    await app.inject({
      method: "POST",
      url: "/api/devops/outages",
      payload: {
        service: "postgresql",
        reason: "Conexão perdida",
      },
    });

    await app.inject({
      method: "POST",
      url: "/api/devops/outages",
      payload: {
        service: "frontend-portal",
        reason: "Erro de build em produção",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/devops/outages?service=postgresql",
    });

    expect(response.statusCode).toBe(200);
    const list = response.json();
    expect(list).toHaveLength(1);
    expect(list[0].service).toBe("postgresql");
  });

  it("GET /api/devops/outages/:id returns details or 404 if not found", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/devops/outages",
      payload: {
        service: "iot-ingestion",
        reason: "Congestionamento de rede",
      },
    });

    const created = createRes.json();

    const getRes = await app.inject({
      method: "GET",
      url: `/api/devops/outages/${created.id}`,
    });

    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().id).toBe(created.id);

    const notFoundRes = await app.inject({
      method: "GET",
      url: "/api/devops/outages/inexistent-outage-id",
    });

    expect(notFoundRes.statusCode).toBe(404);
  });

  it("PATCH /api/devops/outages/:id/resolve closes the outage and computes duration", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/devops/outages",
      payload: {
        service: "database",
        reason: "Lock de transação prolongado",
        startTime: "2026-10-21T07:00:00.000Z",
      },
    });

    const created = createRes.json();

    const resolveRes = await app.inject({
      method: "PATCH",
      url: `/api/devops/outages/${created.id}/resolve`,
      payload: {
        endTime: "2026-10-21T07:10:00.000Z",
        resolutionNotes:
          "Processo bloqueador finalizado com pg_terminate_backend",
        rootCause: "Deadlock em migração assíncrona",
      },
    });

    expect(resolveRes.statusCode).toBe(200);
    const resolved = resolveRes.json();
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.durationSeconds).toBe(600); // 10 minutos = 600s
    expect(resolved.failureDetails.rootCause).toContain("Deadlock");
  });

  it("GET /api/devops/sla validates availability SLA metrics against target", async () => {
    // Registra uma indisponibilidade curta
    await app.inject({
      method: "POST",
      url: "/api/devops/outages",
      payload: {
        service: "api-backend",
        reason: "Reinicialização rápida",
        startTime: new Date(Date.now() - 120_000).toISOString(),
        endTime: new Date().toISOString(),
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/devops/sla?windowHours=24&slaTargetPercentage=99.0",
    });

    expect(response.statusCode).toBe(200);
    const report = response.json();
    expect(report).toHaveProperty("availabilityPercentage");
    expect(report).toHaveProperty("slaCompliant");
    expect(report.slaTargetPercentage).toBe(99.0);
    expect(report.outagesCount).toBeGreaterThanOrEqual(1);
    expect(report).toHaveProperty("mttrMinutes");
    expect(report).toHaveProperty("mttfHours");
  });

  it("GET /metrics includes OpenMetrics for recorded outages and SLA", async () => {
    await app.inject({
      method: "POST",
      url: "/api/devops/outages",
      payload: {
        service: "api-backend",
        reason: "Incidente de teste",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/metrics",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("vulture_outages_total 1");
    expect(response.body).toContain("vulture_outages_active 1");
    expect(response.body).toContain("vulture_outage_downtime_seconds_total");
    expect(response.body).toContain(
      "vulture_sla_availability_ratio_percentage",
    );
  });
});
