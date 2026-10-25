import { describe, expect, it } from "vitest";

import { type Sample, summarize } from "./load-metrics.js";

const sample = (durationMs: number, status = 200, valid = true): Sample => ({
  route: "/api/stations/current",
  status,
  valid,
  durationMs,
  bytes: 100,
  startedAt: "2026-10-23T00:00:00Z",
});

describe("critérios de capacidade SCRUM-472", () => {
  it("calcula p95 por nearest rank e vazão usando o tempo completo", () => {
    const result = summarize(
      Array.from({ length: 20 }, (_, i) => sample(i + 1)),
      10,
    );
    expect(result.latencyMs).toMatchObject({
      p50: 10,
      p95: 19,
      p99: 20,
      max: 20,
    });
    expect(result.requestsPerSecond).toBe(2);
    expect(result.passed).toBe(true);
  });
  it("não aprova respostas rápidas de rate limit nem corpo inválido", () => {
    expect(summarize([sample(1, 429)], 1).passed).toBe(false);
    expect(summarize([sample(1, 200, false)], 1).passed).toBe(false);
    expect(summarize([], 1).passed).toBe(false);
  });
  it("reprova qualquer resposta válida acima dos 3 segundos documentados", () => {
    const result = summarize(
      [...Array.from({ length: 100 }, () => sample(10)), sample(3001)],
      10,
    );
    expect(result.latencyMs.p95).toBe(10);
    expect(result.slowRequests).toBe(1);
    expect(result.passed).toBe(false);
    expect(summarize([sample(3000)], 3).passed).toBe(true);
  });
  it("contabiliza timeout e erros sem incluí-los na latência de sucesso", () => {
    const result = summarize(
      [sample(20), sample(10000, 0), sample(1, 503)],
      10,
    );
    expect(result.errors).toBe(2);
    expect(result.timeouts).toBe(1);
    expect(result.latencyMs.max).toBe(20);
    expect(result.passed).toBe(false);
  });
});
