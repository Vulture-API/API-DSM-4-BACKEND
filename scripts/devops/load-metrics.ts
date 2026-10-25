export type Sample = {
  route: string;
  status: number;
  durationMs: number;
  bytes: number;
  valid: boolean;
  startedAt: string;
};

export function summarize(samples: Sample[], elapsedSeconds: number) {
  const successful = samples.filter((s) => s.status === 200 && s.valid);
  const durations = successful.map((s) => s.durationMs).sort((a, b) => a - b);
  const percentile = (p: number) =>
    durations.length
      ? durations[Math.max(0, Math.ceil(durations.length * p) - 1)]!
      : null;
  const slow = successful.filter((s) => s.durationMs > 3000).length;
  const errors = samples.length - successful.length;
  return {
    requests: samples.length,
    successes: successful.length,
    errors,
    rateLimited: samples.filter((s) => s.status === 429).length,
    timeouts: samples.filter((s) => s.status === 0).length,
    slowRequests: slow,
    successPercent: samples.length
      ? (successful.length / samples.length) * 100
      : 0,
    requestsPerSecond: elapsedSeconds > 0 ? samples.length / elapsedSeconds : 0,
    latencyMs: {
      mean: durations.length
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      max: durations.at(-1) ?? null,
    },
    // A resposta precisa ser válida: erros rápidos não aprovam capacidade.
    passed:
      samples.length > 0 &&
      errors / samples.length <= 0.01 &&
      successful.length > 0 &&
      slow === 0,
    statuses: Object.fromEntries(
      [...new Set(samples.map((s) => s.status))].map((status) => [
        status,
        samples.filter((s) => s.status === status).length,
      ]),
    ),
  };
}
