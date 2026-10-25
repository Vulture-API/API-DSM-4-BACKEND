// Reconstruir a evidência com campos permitidos, sem persistir a resposta da API.
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Formato de métricas inválido.");
  return value as Record<string, unknown>;
}

function metric(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  )
    throw new Error("Valor de métrica inválido.");
  return Number(value);
}

function choice<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] {
  // Retornar uma constante local em vez do texto recebido pela rede.
  for (const entry of allowed) if (value === entry) return entry;
  throw new Error("Classificação de métrica inválida.");
}

function metrics<const T extends readonly string[]>(value: unknown, fields: T) {
  const source = record(value);
  return Object.fromEntries(
    fields.map((key) => [key, metric(source[key])]),
  ) as Record<T[number], number>;
}

export function resourceEvidence(value: unknown) {
  const source = record(value);
  const resources = record(source.resources);
  const eventLoop = record(resources.eventLoop);
  if (!Array.isArray(source.bottlenecks) || source.bottlenecks.length > 100)
    throw new Error("Lista de gargalos inválida.");
  return {
    status: choice(source.status, ["HEALTHY", "DEGRADED", "UNHEALTHY"]),
    timestamp: new Date().toISOString(),
    uptimeSeconds: metric(source.uptimeSeconds),
    resources: {
      memory: metrics(resources.memory, [
        "heapUsedBytes",
        "heapTotalBytes",
        "rssBytes",
        "externalBytes",
        "heapUsedMb",
        "heapTotalMb",
        "rssMb",
        "heapUsagePercent",
      ]),
      cpu: metrics(resources.cpu, [
        "userMicroseconds",
        "systemMicroseconds",
        "cpuPercent",
      ]),
      eventLoop: {
        lagMs: metric(eventLoop.lagMs),
        status: choice(eventLoop.status, ["NORMAL", "WARNING", "CRITICAL"]),
      },
      databasePool: metrics(resources.databasePool, [
        "totalConnections",
        "idleConnections",
        "activeConnections",
        "waitingClients",
      ]),
      system: metrics(resources.system, [
        "totalMemoryBytes",
        "freeMemoryBytes",
        "usedMemoryBytes",
        "memoryUsagePercent",
        "cpuCores",
        "loadAverage1m",
      ]),
    },
    bottlenecks: source.bottlenecks.map((item: unknown) => {
      const bottleneck = record(item);
      return {
        type: choice(bottleneck.type, [
          "HIGH_MEMORY",
          "CPU_SATURATION",
          "EVENT_LOOP_BLOCKED",
          "DB_POOL_SATURATION",
          "DB_SLOW_QUERY",
          "HIGH_LATENCY",
        ]),
        severity: choice(bottleneck.severity, ["WARNING", "CRITICAL"]),
      };
    }),
  };
}
