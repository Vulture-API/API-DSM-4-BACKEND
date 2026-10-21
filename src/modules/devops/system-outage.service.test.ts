import { describe, expect, it } from "vitest";

import { DevOpsOutageService } from "./devops-outage.service.js";
import { InMemorySystemOutageRepository } from "./system-outage.repository.js";

describe("DevOpsOutageService (Unit Tests)", () => {
  it("starts a new outage with OPEN status and captures failure context", async () => {
    const repository = new InMemorySystemOutageRepository();
    const fixedNow = new Date("2026-10-21T10:00:00.000Z");
    const service = new DevOpsOutageService(repository, () => fixedNow);

    const outage = await service.startOutage({
      service: "api-backend",
      severity: "CRITICAL",
      reason: "Timeout na comunicação com gateway de pagamentos",
      failureDetails: {
        error: "ECONNRESET",
        httpStatus: 504,
        impactedEndpoints: ["/api/checkout"],
        detectionSource: "METRICS_ALERT",
      },
    });

    expect(outage.id).toBeDefined();
    expect(outage.service).toBe("api-backend");
    expect(outage.severity).toBe("CRITICAL");
    expect(outage.status).toBe("OPEN");
    expect(outage.startTime).toBe("2026-10-21T10:00:00.000Z");
    expect(outage.endTime).toBeNull();
    expect(outage.durationSeconds).toBeNull();
    expect(outage.reason).toContain("Timeout");
    expect(outage.failureDetails.error).toBe("ECONNRESET");
    expect(outage.failureDetails.httpStatus).toBe(504);
  });

  it("avoids creating duplicate OPEN outages for the same service", async () => {
    const repository = new InMemorySystemOutageRepository();
    const service = new DevOpsOutageService(repository);

    const first = await service.startOutage({
      service: "postgresql",
      reason: "Falha de conexão com pool",
    });

    const second = await service.startOutage({
      service: "postgresql",
      reason: "Outro erro de pool",
    });

    expect(second.id).toBe(first.id);
    const openList = await service.listOutages({ status: "OPEN" });
    expect(openList).toHaveLength(1);
  });

  it("resolves an open outage, calculating accurate duration in seconds", async () => {
    const repository = new InMemorySystemOutageRepository();
    let currentTime = new Date("2026-10-21T12:00:00.000Z");
    const service = new DevOpsOutageService(repository, () => currentTime);

    const outage = await service.startOutage({
      service: "sensor-ingestion",
      reason: "Saturação de fila MQTT",
    });

    // Simula 300 segundos (5 minutos) de indisponibilidade
    currentTime = new Date("2026-10-21T12:05:00.000Z");

    const resolved = await service.resolveOutage(outage.id, {
      resolutionNotes:
        "Reinicialização de broker MQTT e expurgo de mensagens corrompidas.",
      rootCause: "Deadlock em worker de ingestão assíncrona",
    });

    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.endTime).toBe("2026-10-21T12:05:00.000Z");
    expect(resolved.durationSeconds).toBe(300);
    expect(resolved.failureDetails.resolutionNotes).toContain(
      "Reinicialização",
    );
    expect(resolved.failureDetails.rootCause).toContain("Deadlock");
  });

  it("records directly a completed historical outage", async () => {
    const repository = new InMemorySystemOutageRepository();
    const service = new DevOpsOutageService(repository);

    const outage = await service.recordCompletedOutage({
      service: "portal-frontend",
      severity: "HIGH",
      reason: "Manutenção programada de infraestrutura",
      startTime: "2026-10-20T02:00:00.000Z",
      endTime: "2026-10-20T02:15:30.000Z",
      failureDetails: {
        resolutionNotes:
          "Atualização de versão de container e certificados TLS",
      },
    });

    expect(outage.status).toBe("RESOLVED");
    expect(outage.startTime).toBe("2026-10-20T02:00:00.000Z");
    expect(outage.endTime).toBe("2026-10-20T02:15:30.000Z");
    expect(outage.durationSeconds).toBe(930); // 15m 30s = 930s
  });

  it("automatically transitions outage lifecycle based on health check hooks", async () => {
    const repository = new InMemorySystemOutageRepository();
    let now = new Date("2026-10-21T08:00:00.000Z");
    const service = new DevOpsOutageService(repository, () => now);

    // Sistema detecta falha e fica UNHEALTHY
    const openOutage = await service.handleStatusChange(
      "postgresql",
      "UNHEALTHY",
      {
        error: "Connection refused on port 5432",
      },
    );

    expect(openOutage).not.toBeNull();
    expect(openOutage?.status).toBe("OPEN");
    expect(openOutage?.service).toBe("postgresql");

    // Passam 2 minutos (120 segundos) e o banco se recupera (HEALTHY)
    now = new Date("2026-10-21T08:02:00.000Z");
    const resolvedOutage = await service.handleStatusChange(
      "postgresql",
      "HEALTHY",
    );

    expect(resolvedOutage).not.toBeNull();
    expect(resolvedOutage?.status).toBe("RESOLVED");
    expect(resolvedOutage?.durationSeconds).toBe(120);
    expect(resolvedOutage?.failureDetails.resolutionNotes).toContain(
      "Recuperação automática",
    );
  });

  it("calculates SLA availability and validates compliance (SLA >= 99%)", async () => {
    const repository = new InMemorySystemOutageRepository();
    const now = new Date("2026-10-21T12:00:00.000Z");
    const service = new DevOpsOutageService(repository, () => now);

    // Janela de avaliação: 24 horas = 86400 segundos
    // Meta de 99%: downtime máximo tolerado = 864 segundos (14.4 minutos)

    // Cenário 1: 300 segundos de downtime (0.347%) -> Disponibilidade = 99.653% (COMPLIANT)
    await service.recordCompletedOutage({
      service: "api-backend",
      reason: "Instabilidade de rede momentânea",
      startTime: "2026-10-21T06:00:00.000Z",
      endTime: "2026-10-21T06:05:00.000Z", // 300s
    });

    const reportCompliant = await service.calculateSlaReport({
      windowHours: 24,
      slaTargetPercentage: 99.0,
    });

    expect(reportCompliant.totalTimeSeconds).toBe(86400);
    expect(reportCompliant.downtimeSeconds).toBe(300);
    expect(reportCompliant.uptimeSeconds).toBe(86100);
    expect(reportCompliant.availabilityPercentage).toBe(99.653);
    expect(reportCompliant.slaCompliant).toBe(true);
    expect(reportCompliant.slaGapPercentage).toBeGreaterThan(0);
    expect(reportCompliant.outagesCount).toBe(1);
    expect(reportCompliant.mttrMinutes).toBe(5);

    // Cenário 2: Adiciona outra falha longa de 2 horas (7200s), violando o SLA
    await service.recordCompletedOutage({
      service: "postgresql",
      reason: "Falha catastrófica de storage",
      startTime: "2026-10-21T08:00:00.000Z",
      endTime: "2026-10-21T10:00:00.000Z", // 7200s
    });

    const reportViolated = await service.calculateSlaReport({
      windowHours: 24,
      slaTargetPercentage: 99.0,
    });

    expect(reportViolated.downtimeSeconds).toBe(7500); // 300 + 7200
    expect(reportViolated.uptimeSeconds).toBe(78900);
    expect(reportViolated.availabilityPercentage).toBe(91.319);
    expect(reportViolated.slaCompliant).toBe(false);
    expect(reportViolated.slaGapPercentage).toBeLessThan(0);
    expect(reportViolated.outagesCount).toBe(2);
    // MTTR médio: (300 + 7200) / 2 = 3750s = 62.5 minutos
    expect(reportViolated.mttrMinutes).toBe(62.5);
  });

  it("filters outages by service, status and date range correctly", async () => {
    const repository = new InMemorySystemOutageRepository();
    const service = new DevOpsOutageService(repository);

    await service.recordCompletedOutage({
      service: "api-backend",
      reason: "Falha A",
      startTime: "2026-10-18T10:00:00.000Z",
      endTime: "2026-10-18T10:10:00.000Z",
    });

    await service.recordCompletedOutage({
      service: "postgresql",
      reason: "Falha B",
      startTime: "2026-10-19T10:00:00.000Z",
      endTime: "2026-10-19T10:20:00.000Z",
    });

    await service.startOutage({
      service: "api-backend",
      reason: "Falha C em aberto",
      startTime: "2026-10-20T10:00:00.000Z",
    });

    const apiOutages = await service.listOutages({ service: "api-backend" });
    expect(apiOutages).toHaveLength(2);

    const openOutages = await service.listOutages({ status: "OPEN" });
    expect(openOutages).toHaveLength(1);
    expect(openOutages[0]?.reason).toContain("Falha C");

    const resolvedOutages = await service.listOutages({ status: "RESOLVED" });
    expect(resolvedOutages).toHaveLength(2);

    const dateFiltered = await service.listOutages({
      from: "2026-10-19T00:00:00.000Z",
      to: "2026-10-19T23:59:59.000Z",
    });
    expect(dateFiltered).toHaveLength(1);
    expect(dateFiltered[0]?.service).toBe("postgresql");
  });
});
