import { describe, expect, it } from "vitest";

import { resourceEvidence } from "./load-evidence.js";

const snapshot = () => ({
  status: "DEGRADED",
  timestamp: "remote timestamp",
  uptimeSeconds: 120,
  resources: {
    memory: {
      heapUsedBytes: 50_000_000,
      heapTotalBytes: 100_000_000,
      rssBytes: 200_000_000,
      externalBytes: 1_000_000,
      heapUsedMb: 50,
      heapTotalMb: 100,
      rssMb: 200,
      heapUsagePercent: 50,
    },
    cpu: { userMicroseconds: 1000, systemMicroseconds: 100, cpuPercent: 30 },
    eventLoop: { lagMs: 4, status: "NORMAL" },
    databasePool: {
      totalConnections: 10,
      idleConnections: 0,
      activeConnections: 10,
      waitingClients: 60,
    },
    system: {
      totalMemoryBytes: 1e9,
      freeMemoryBytes: 5e8,
      usedMemoryBytes: 5e8,
      memoryUsagePercent: 50,
      cpuCores: 8,
      loadAverage1m: 0,
    },
  },
  bottlenecks: [
    {
      type: "DB_POOL_SATURATION",
      severity: "WARNING",
      message: "sensitive remote message",
      mitigation: "untrusted text",
    },
  ],
});

describe("evidências de monitoramento SCRUM-472", () => {
  it("preserva métricas e classificações, removendo campos livres da API", () => {
    const input = { ...snapshot(), access_token: "secret-token" };
    Object.assign(input.resources.memory, { secret: "sensitive field" });
    const result = resourceEvidence(input);
    expect(result.resources.databasePool.waitingClients).toBe(60);
    expect(result.resources.memory.rssMb).toBe(200);
    expect(result.resources.cpu.cpuPercent).toBe(30);
    expect(result.bottlenecks).toEqual([
      { type: "DB_POOL_SATURATION", severity: "WARNING" },
    ]);
    expect(result.timestamp).not.toBe(input.timestamp);
    expect(Number.isFinite(Date.parse(result.timestamp))).toBe(true);
    const serialized = JSON.stringify(result);
    for (const text of [
      "sensitive",
      "secret-token",
      "untrusted",
      "remote timestamp",
    ])
      expect(serialized).not.toContain(text);
  });

  it.each(["200", null, NaN, Infinity, -1, Number.MAX_VALUE])(
    "rejeita métrica inválida: %s",
    (value) => {
      const input = snapshot();
      Object.assign(input.resources.memory, { rssMb: value });
      expect(() => resourceEvidence(input)).toThrow(
        "Valor de métrica inválido.",
      );
    },
  );

  it("rejeita classificações desconhecidas e estruturas incompletas", () => {
    const input = snapshot();
    input.bottlenecks[0]!.type = "unexpected remote text";
    expect(() => resourceEvidence(input)).toThrow(
      "Classificação de métrica inválida.",
    );
    expect(() => resourceEvidence({ resources: null })).toThrow();
    expect(() => resourceEvidence([])).toThrow();
  });
});
