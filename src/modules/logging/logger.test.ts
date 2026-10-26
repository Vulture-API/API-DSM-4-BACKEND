import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLogger, logger } from "./logger.js";

describe("logger", () => {
  it("instancia logger padrão com campos estruturados", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
  });

  it("emite logs em formato JSON padronizado com timestamp, level, component, operation e requestId", () => {
    const outputLines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        outputLines.push(chunk.toString());
        callback();
      },
    });

    const testLogger = createLogger({
      level: "info",
      component: "test-comp",
      stream,
    });

    testLogger.info(
      {
        operation: "CREATE_STATION",
        requestId: "req-abc-123",
        result: "success",
        durationMs: 45.2,
      },
      "Estação cadastrada com sucesso",
    );

    expect(outputLines.length).toBe(1);
    const parsed = JSON.parse(outputLines[0] as string) as Record<
      string,
      unknown
    >;

    expect(parsed.level).toBe("info");
    expect(parsed.component).toBe("test-comp");
    expect(parsed.operation).toBe("CREATE_STATION");
    expect(parsed.requestId).toBe("req-abc-123");
    expect(parsed.result).toBe("success");
    expect(parsed.durationMs).toBe(45.2);
    expect(parsed.message).toBe("Estação cadastrada com sucesso");
    expect(typeof parsed.timestamp).toBe("string");
    expect(new Date(parsed.timestamp as string).getTime()).not.toBeNaN();
  });

  it("redige dados sensíveis em logs emitidos", () => {
    const outputLines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        outputLines.push(chunk.toString());
        callback();
      },
    });

    const testLogger = createLogger({
      level: "info",
      component: "auth",
      stream,
    });

    testLogger.info(
      {
        operation: "LOGIN",
        password: "plaintext-password",
        token: "bearer-token-123",
        headers: {
          authorization: "Bearer secret-jwt",
        },
      },
      "Tentativa de login",
    );

    const parsed = JSON.parse(outputLines[0] as string) as Record<
      string,
      unknown
    >;
    expect(parsed.password).toBe("[REDACTED]");
    expect(parsed.token).toBe("[REDACTED]");
    expect((parsed.headers as Record<string, unknown>).authorization).toBe(
      "[REDACTED]",
    );
  });

  it("cria child loggers com campos herdados e sobrepostos", () => {
    const outputLines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        outputLines.push(chunk.toString());
        callback();
      },
    });

    const rootLogger = createLogger({
      level: "info",
      component: "root",
      stream,
    });

    const child = rootLogger.child({
      component: "rules-engine",
      requestId: "cycle-99",
    });

    child.info(
      { operation: "EVALUATE_RULES", result: "success" },
      "Ciclo concluído",
    );

    const parsed = JSON.parse(outputLines[0] as string) as Record<
      string,
      unknown
    >;
    expect(parsed.component).toBe("rules-engine");
    expect(parsed.requestId).toBe("cycle-99");
    expect(parsed.operation).toBe("EVALUATE_RULES");
    expect(parsed.result).toBe("success");
  });
});
