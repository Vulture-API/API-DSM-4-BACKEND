import type { FastifyPluginAsync } from "fastify";
import type { Pool } from "pg";

import {
  type DatabaseHealth,
  DevOpsMetricsService,
} from "./devops-metrics.service.js";

export type DevOpsRoutesOptions = {
  database?: Pool;
  metricsService?: DevOpsMetricsService;
};

export const devopsRoutes: FastifyPluginAsync<DevOpsRoutesOptions> = async (
  fastify,
  options,
) => {
  const metricsService =
    options.metricsService ?? DevOpsMetricsService.getInstance();
  const pool = options.database;

  const checkDatabaseHealth = async (): Promise<DatabaseHealth> => {
    if (!pool) {
      return { status: "UP" };
    }
    const start = performance.now();
    try {
      await pool.query("SELECT 1");
      const latencyMs = Number((performance.now() - start).toFixed(2));
      return {
        status: latencyMs > 1000 ? "DEGRADED" : "UP",
        latencyMs,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "DOWN",
        error: message,
      };
    }
  };

  // Endpoint no formato Prometheus / OpenMetrics
  fastify.get(
    "/metrics",
    {
      config: {
        access: { public: true },
        rateLimit: false,
      },
    },
    async (_request, reply) => {
      const dbHealth = await checkDatabaseHealth();
      const output = metricsService.toPrometheusMetrics(dbHealth);
      return reply
        .header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
        .send(output);
    },
  );

  // Endpoint detalhado em JSON para observabilidade e análise do time
  const handleDetailedMetrics = async () => {
    const dbHealth = await checkDatabaseHealth();
    return metricsService.getSummary(dbHealth);
  };

  fastify.get(
    "/health/detailed",
    {
      config: {
        access: { public: true },
        rateLimit: false,
      },
    },
    handleDetailedMetrics,
  );

  fastify.get(
    "/api/devops/metrics",
    {
      config: {
        access: { public: true },
        rateLimit: false,
      },
    },
    handleDetailedMetrics,
  );

  // Verificação rápida de liveness
  fastify.get(
    "/api/devops/ping",
    {
      config: {
        access: { public: true },
        rateLimit: false,
      },
    },
    async () => ({
      status: "pong",
      timestamp: Date.now(),
    }),
  );
};
