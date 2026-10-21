import type { FastifyPluginAsync } from "fastify";
import type { Pool } from "pg";

import {
  type DatabaseHealth,
  DevOpsMetricsService,
} from "./devops-metrics.service.js";
import { DevOpsOutageService } from "./devops-outage.service.js";
import {
  createOutageSchema,
  outageFilterSchema,
  resolveOutageSchema,
  slaCalculationSchema,
} from "./system-outage.entity.js";
import {
  InMemorySystemOutageRepository,
  PgSystemOutageRepository,
  type SystemOutageRepository,
} from "./system-outage.repository.js";

export type DevOpsRoutesOptions = {
  database?: Pool | undefined;
  metricsService?: DevOpsMetricsService | undefined;
  outageRepository?: SystemOutageRepository | undefined;
  outageService?: DevOpsOutageService | undefined;
};

export const devopsRoutes: FastifyPluginAsync<DevOpsRoutesOptions> = async (
  fastify,
  options,
) => {
  const metricsService =
    options.metricsService ?? DevOpsMetricsService.getInstance();
  const pool = options.database;

  if (pool) {
    metricsService.setDatabasePool(pool);
  }

  const isPgPool =
    pool &&
    typeof (pool as unknown as { connect?: unknown }).connect === "function";

  const outageService =
    options.outageService ??
    new DevOpsOutageService(
      options.outageRepository ??
        (isPgPool
          ? new PgSystemOutageRepository(pool)
          : new InMemorySystemOutageRepository()),
    );

  const checkDatabaseHealth = async (): Promise<DatabaseHealth> => {
    if (!pool) {
      return { status: "UP" };
    }
    const start = performance.now();
    try {
      await pool.query("SELECT 1");
      const latencyMs = Number((performance.now() - start).toFixed(2));
      const dbHealth: DatabaseHealth = {
        status: latencyMs > 1000 ? "DEGRADED" : "UP",
        latencyMs,
      };

      // Recuperação automática se o banco estiver saudável
      await outageService.handleStatusChange("postgresql", "HEALTHY");

      return dbHealth;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      // Registro automático de indisponibilidade em caso de queda de banco
      await outageService.handleStatusChange("postgresql", "UNHEALTHY", {
        error: message,
        rootCause:
          "Falha de conectividade ou timeout na consulta de ping do PostgreSQL",
        httpStatus: 503,
      });

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
      const slaSnapshot = await outageService.calculateSlaReport({
        windowHours: 720,
      });

      const output = metricsService.toPrometheusMetrics(dbHealth, pool, {
        totalOutages: slaSnapshot.outagesCount,
        activeOutages: slaSnapshot.activeOutagesCount,
        totalDowntimeSeconds: slaSnapshot.downtimeSeconds,
        slaAvailabilityPercentage: slaSnapshot.availabilityPercentage,
      });

      return reply
        .header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
        .send(output);
    },
  );

  // Endpoint detalhado em JSON para observabilidade e análise do time
  const handleDetailedMetrics = async () => {
    const dbHealth = await checkDatabaseHealth();
    const summary = metricsService.getSummary(dbHealth, pool);
    const slaReport = await outageService.calculateSlaReport({
      windowHours: 720,
    });

    return {
      ...summary,
      slaValidation: {
        slaTargetPercentage: slaReport.slaTargetPercentage,
        availabilityPercentage: slaReport.availabilityPercentage,
        slaCompliant: slaReport.slaCompliant,
        slaGapPercentage: slaReport.slaGapPercentage,
        downtimeSeconds: slaReport.downtimeSeconds,
        activeOutagesCount: slaReport.activeOutagesCount,
        totalOutagesCount: slaReport.outagesCount,
        mttrMinutes: slaReport.mttrMinutes,
        mttfHours: slaReport.mttfHours,
      },
    };
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

  // Endpoint específico para análise rápida de recursos e gargalos pelo time
  fastify.get(
    "/api/devops/resources",
    {
      config: {
        access: { public: true },
        rateLimit: false,
      },
    },
    async () => {
      const dbHealth = await checkDatabaseHealth();
      const summary = metricsService.getSummary(dbHealth, pool);
      return {
        status: summary.status,
        timestamp: new Date().toISOString(),
        uptimeSeconds: summary.uptimeSeconds,
        resources: summary.resources,
        bottlenecks: summary.bottlenecks,
      };
    },
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

  // --- Endpoints de Registro e Acompanhamento de Indisponibilidades ---

  // Consulta histórico de indisponibilidades
  fastify.get(
    "/api/devops/outages",
    {
      config: {
        access: { public: true },
        rateLimit: false,
      },
    },
    async (request) => {
      const filter = outageFilterSchema.parse(request.query);
      return outageService.listOutages(filter);
    },
  );

  // Consulta detalhes de uma indisponibilidade específica
  fastify.get(
    "/api/devops/outages/:id",
    {
      config: {
        access: { public: true },
        rateLimit: false,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const outage = await outageService.getOutageById(id);
      if (!outage) {
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message: `Indisponibilidade com ID '${id}' não encontrada.`,
        });
      }
      return outage;
    },
  );

  // Registro de nova indisponibilidade
  fastify.post(
    "/api/devops/outages",
    {
      config: {
        access: { public: true },
        rateLimit: false,
      },
    },
    async (request, reply) => {
      const dto = createOutageSchema.parse(request.body);
      const outage = dto.endTime
        ? await outageService.recordCompletedOutage({
            ...dto,
            endTime: dto.endTime,
          })
        : await outageService.startOutage(dto);

      return reply.status(201).send(outage);
    },
  );

  // Encerramento / Resolução de indisponibilidade
  fastify.patch(
    "/api/devops/outages/:id/resolve",
    {
      config: {
        access: { public: true },
        rateLimit: false,
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const dto = resolveOutageSchema.parse(request.body ?? {});

      try {
        const resolved = await outageService.resolveOutage(id, dto);
        return reply.send(resolved);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(404).send({
          statusCode: 404,
          error: "Not Found",
          message,
        });
      }
    },
  );

  // Cálculo e Validação Formal do SLA com base no histórico de indisponibilidades
  fastify.get(
    "/api/devops/sla",
    {
      config: {
        access: { public: true },
        rateLimit: false,
      },
    },
    async (request) => {
      const params = slaCalculationSchema.parse(request.query);
      return outageService.calculateSlaReport(params);
    },
  );
};
