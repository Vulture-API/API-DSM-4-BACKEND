import { Writable } from "node:stream";

import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "@/app.js";

import { AuditService } from "./audit-logger.js";
import { createLogger } from "./logger.js";

describe("logging-integration", () => {
  let app: FastifyInstance;
  let logLines: string[];
  let auditService: AuditService;

  beforeEach(async () => {
    logLines = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        logLines.push(chunk.toString());
        callback();
      },
    });

    const testLogger = createLogger({
      level: "info",
      component: "http",
      stream,
    });

    AuditService.resetInstance();
    auditService = new AuditService({ logger: testLogger });

    app = buildApp({
      logger: testLogger,
      auditService,
    });
  });

  afterEach(async () => {
    await app.close();
    AuditService.resetInstance();
  });

  it("registra requisição recebida e requisição concluída com tempo de resposta", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);

    const logs = logLines.map(
      (line) => JSON.parse(line) as Record<string, unknown>,
    );
    const incoming = logs.find(
      (l) =>
        l.component === "http" &&
        String(l.message).includes("Incoming request"),
    );
    const completed = logs.find(
      (l) =>
        l.component === "http" &&
        String(l.message).includes("Request completed"),
    );

    expect(incoming).toBeDefined();
    expect(incoming?.method).toBe("GET");
    expect(incoming?.url).toBe("/health");
    expect(incoming?.requestId).toBeDefined();

    expect(completed).toBeDefined();
    expect(completed?.statusCode).toBe(200);
    expect(completed?.result).toBe("success");
    expect(typeof completed?.durationMs).toBe("number");
  });

  it("propaga e preserva o header x-request-id enviado pelo cliente", async () => {
    const customRequestId = "client-trace-123456";
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        "x-request-id": customRequestId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBe(customRequestId);

    const logs = logLines.map(
      (line) => JSON.parse(line) as Record<string, unknown>,
    );
    const matchingLog = logs.find((l) => l.requestId === customRequestId);
    expect(matchingLog).toBeDefined();
  });

  it("gera automaticamente um correlation ID quando não fornecido pelo cliente", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const generatedId = response.headers["x-request-id"];
    expect(typeof generatedId).toBe("string");
    expect((generatedId as string).length).toBeGreaterThan(10);
  });

  it("registra erro estruturado antes de responder requisição com falha de validação", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: {},
    });

    expect(response.statusCode).toBe(400);

    const logs = logLines.map(
      (line) => JSON.parse(line) as Record<string, unknown>,
    );
    const errorLog = logs.find(
      (l) => l.result === "error" && l.statusCode === 400,
    );

    expect(errorLog).toBeDefined();
    expect(errorLog?.component).toBe("users");
    expect(errorLog?.error).toBeDefined();
  });

  it("gera eventos de auditoria em operações de mutação e permite consulta via /api/devops/audit-logs", async () => {
    // 1. Executa uma mutação que deve gerar auditoria (ex: POST /api/devops/outages)
    const outagePayload = {
      service: "STATION_COLLECTOR",
      reason: "Falha de rede para teste de auditoria",
      startTime: new Date().toISOString(),
    };

    const postResponse = await app.inject({
      method: "POST",
      url: "/api/devops/outages",
      payload: outagePayload,
    });

    expect(postResponse.statusCode).toBe(201);

    // 2. Consulta o histórico de auditoria via /api/devops/audit-logs
    const auditResponse = await app.inject({
      method: "GET",
      url: "/api/devops/audit-logs",
    });

    expect(auditResponse.statusCode).toBe(200);
    const auditEvents = auditResponse.json() as Array<Record<string, unknown>>;
    expect(auditEvents.length).toBeGreaterThan(0);

    const outageEvent = auditEvents.find(
      (e) => e.category === "SYSTEM" && e.action === "CREATE",
    );
    expect(outageEvent).toBeDefined();
    expect(outageEvent?.result).toBe("SUCCESS");
    expect(outageEvent?.requestId).toBeDefined();
  });

  it("sanitiza credenciais e senhas nos logs de requisições de autenticação", async () => {
    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "test@example.com",
        password: "my-plain-text-password",
      },
      headers: {
        authorization: "Bearer sensitive-token-here",
      },
    });

    // Nenhum log bruto deve conter a senha em texto aberto
    for (const line of logLines) {
      expect(line).not.toContain("my-plain-text-password");
      expect(line).not.toContain("sensitive-token-here");
    }
  });
});
