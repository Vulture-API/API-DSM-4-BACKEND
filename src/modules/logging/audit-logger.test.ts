import { Writable } from "node:stream";

import { beforeEach, describe, expect, it } from "vitest";

import { AuditService } from "./audit-logger.js";
import { createLogger } from "./logger.js";

describe("AuditService", () => {
  let auditService: AuditService;
  let logLines: string[];

  beforeEach(() => {
    logLines = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString());
        callback();
      },
    });

    const testLogger = createLogger({
      level: "info",
      component: "audit-test",
      stream,
    });

    auditService = new AuditService({ maxEvents: 5, logger: testLogger });
  });

  it("registra evento de auditoria com id único, timestamp e sanitização de detalhes", () => {
    const event = auditService.record({
      category: "AUTHENTICATION",
      action: "LOGIN",
      operation: "POST /api/auth/login",
      actor: { email: "user@vulture.com", ip: "127.0.0.1" },
      target: { type: "user" },
      result: "SUCCESS",
      requestId: "req-123",
      details: {
        password: "secretpassword",
        browser: "Chrome",
      },
    });

    expect(event.id).toBeDefined();
    expect(typeof event.id).toBe("string");
    expect(event.timestamp).toBeDefined();
    expect(event.details?.password).toBe("[REDACTED]");
    expect(event.details?.browser).toBe("Chrome");

    // Verifica que log estruturado foi emitido
    expect(logLines.length).toBe(1);
    const parsedLog = JSON.parse(logLines[0] as string) as Record<
      string,
      unknown
    >;
    expect(parsedLog.component).toBe("audit");
    expect(parsedLog.category).toBe("AUTHENTICATION");
    expect(parsedLog.action).toBe("LOGIN");
    expect(parsedLog.result).toBe("SUCCESS");
  });

  it("emite log em nível warn para falhas ou negações de auditoria", () => {
    auditService.record({
      category: "ACCESS_CONTROL",
      action: "DENIED",
      operation: "POST /api/users",
      actor: { id: 2, ip: "10.0.0.1" },
      result: "DENIED",
    });

    expect(logLines.length).toBe(1);
    const parsedLog = JSON.parse(logLines[0] as string) as Record<
      string,
      unknown
    >;
    expect(parsedLog.level).toBe("warn");
    expect(parsedLog.result).toBe("DENIED");
  });

  it("respeita o limite do buffer circular (maxEvents)", () => {
    for (let i = 1; i <= 7; i++) {
      auditService.record({
        category: "ENTITY_MUTATION",
        action: "CREATE",
        operation: `OP_${i}`,
        result: "SUCCESS",
      });
    }

    const events = auditService.listEvents({ limit: 10 });
    expect(events.length).toBe(5);
    // Mais recente primeiro
    expect(events[0]?.operation).toBe("OP_7");
    expect(events[4]?.operation).toBe("OP_3");
  });

  it("filtra eventos por categoria, ação, resultado, ator e tipo de alvo", () => {
    auditService.record({
      category: "USER_MANAGEMENT",
      action: "CREATE",
      operation: "CREATE_USER",
      actor: { id: 10 },
      target: { type: "user", id: 20 },
      result: "SUCCESS",
      timestamp: "2026-10-01T10:00:00.000Z",
    });

    auditService.record({
      category: "USER_MANAGEMENT",
      action: "DELETE",
      operation: "DELETE_USER",
      actor: { id: 10 },
      target: { type: "user", id: 20 },
      result: "FAILURE",
      timestamp: "2026-10-02T10:00:00.000Z",
    });

    auditService.record({
      category: "ENTITY_MUTATION",
      action: "UPDATE",
      operation: "UPDATE_STATION",
      actor: { id: 11 },
      target: { type: "station", id: 5 },
      result: "SUCCESS",
      timestamp: "2026-10-03T10:00:00.000Z",
    });

    // Filtro por categoria
    expect(
      auditService.listEvents({ category: "USER_MANAGEMENT" }).length,
    ).toBe(2);
    // Filtro por ação
    expect(auditService.listEvents({ action: "DELETE" }).length).toBe(1);
    // Filtro por resultado
    expect(auditService.listEvents({ result: "FAILURE" }).length).toBe(1);
    // Filtro por actorId
    expect(auditService.listEvents({ actorId: 10 }).length).toBe(2);
    // Filtro por targetType
    expect(auditService.listEvents({ targetType: "station" }).length).toBe(1);
    // Filtro por período
    const inRange = auditService.listEvents({
      fromDate: "2026-10-02T00:00:00.000Z",
      toDate: "2026-10-02T23:59:59.000Z",
    });
    expect(inRange.length).toBe(1);
    expect(inRange[0]?.operation).toBe("DELETE_USER");
  });

  it("limpa histórico com clear()", () => {
    auditService.record({
      category: "SYSTEM",
      action: "EXECUTE",
      operation: "OCCURRENCE_CHECK",
      result: "SUCCESS",
    });
    expect(auditService.listEvents().length).toBe(1);
    auditService.clear();
    expect(auditService.listEvents().length).toBe(0);
  });

  it("gerencia instância singleton", () => {
    AuditService.resetInstance();
    const inst1 = AuditService.getInstance();
    const inst2 = AuditService.getInstance();
    expect(inst1).toBe(inst2);
    AuditService.resetInstance();
  });
});
