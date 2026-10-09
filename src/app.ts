import "@/config/zod.config.js";

import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyReply } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Pool } from "pg";

import { database } from "@/config/database.js";
import { env } from "@/config/environment.js";
import { handleError } from "@/errors/error-handler.js";
import { handleParametersError } from "@/errors/handlers/parameters.js";
import { handleUsersError } from "@/errors/handlers/users.js";
import type {
  AlertConfigRepository,
  TriggeredAlertRepository,
} from "@/modules/alerts/repositories/alert.repository.js";
import {
  PgAlertConfigRepository,
  PgTriggeredAlertRepository,
} from "@/modules/alerts/repositories/pg-alert.repository.js";
import { buildAlertRoutes } from "@/modules/alerts/routes/alerts.route.js";
import { CachedForecastProvider } from "@/modules/forecast/providers/cached-forecast.provider.js";
import type { ForecastProvider } from "@/modules/forecast/providers/forecast.provider.js";
import { OpenMeteoProvider } from "@/modules/forecast/providers/open-meteo.provider.js";
import { buildForecastRoutes } from "@/modules/forecast/routes/forecast.route.js";
import type { MonitoringRepository } from "@/modules/monitoring/repositories/monitoring.repository.js";
import { PgMonitoringRepository } from "@/modules/monitoring/repositories/pg-monitoring.repository.js";
import {
  buildMonitoringRoutes,
  type LiveLimits,
} from "@/modules/monitoring/routes/monitoring.route.js";
import { ReadingsBroadcaster } from "@/modules/monitoring/services/readings-broadcaster.js";
import {
  RoleRepository,
  type RoleRepositoryPort,
} from "@/modules/roles/repositories/role.repository.js";
import { roleRoutes } from "@/modules/roles/routes/roles.route.js";
import type { RulesEngineWorker } from "@/modules/rules-engine/services/rules-engine.worker.js";
import {
  InMemorySensorTypeRepository,
  PgSensorTypeRepository,
  type SensorTypeRepository,
} from "@/modules/sensor-types/repositories/sensor-type.repository.js";
import { sensorTypeRoutes } from "@/modules/sensor-types/routes/sensor-types.route.js";
import {
  InMemorySensorRepository,
  PgSensorRepository,
  type SensorRepository,
} from "@/modules/sensors/repositories/sensor.repository.js";
import { sensorRoutes } from "@/modules/sensors/routes/sensors.route.js";
import { PgStationRepository } from "@/modules/stations/repositories/pg-station.repository.js";
import type { StationRepository } from "@/modules/stations/repositories/station.repository.js";
import { buildStationRoutes } from "@/modules/stations/routes/stations.route.js";
import { PgStatisticsRepository } from "@/modules/statistics/repositories/pg-statistics.repository.js";
import type { StatisticsRepository } from "@/modules/statistics/repositories/statistics.repository.js";
import { buildStatisticsRoutes } from "@/modules/statistics/routes/statistics.route.js";
import {
  UserRepository,
  type UserRepositoryPort,
} from "@/modules/users/repositories/user.repository.js";
import { userRoutes } from "@/modules/users/routes/users.route.js";
import type { PasswordHasher } from "@/modules/users/services/password-hasher.js";

export type BuildAppOptions = {
  database?: Pool;
  stationRepository?: StationRepository;
  monitoringRepository?: MonitoringRepository;
  statisticsRepository?: StatisticsRepository;
  forecastProvider?: ForecastProvider;
  stationOfflineThresholdMinutes?: number;
  clock?: () => Date;
  alertConfigRepository?: AlertConfigRepository;
  triggeredAlertRepository?: TriggeredAlertRepository;
  rulesEngineWorker?: RulesEngineWorker;
  userRepository?: UserRepositoryPort;
  roleRepository?: RoleRepositoryPort;
  passwordHasher?: PasswordHasher;
  sensorTypeRepository?: SensorTypeRepository;
  sensorRepository?: SensorRepository;
};

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  const pool = options.database ?? database;
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(handleError);
  app.register(cookie);
  app.register(websocket, { options: { maxPayload: 1024 } });
  const health = async () => ({
    status: "ok",
    rules_engine: options.rulesEngineWorker?.isRunning ?? false,
  });
  for (const path of ["/health", "/api/health", "/api/v1/health"])
    app.get(path, health);
  app.get("/", async () => ({ name: "AgriTech - Backend", status: "ok" }));

  app.register(async (users) => {
    users.setErrorHandler(handleUsersError);
    const userRepository = options.userRepository ?? new UserRepository(pool);
    const roleRepository = options.roleRepository ?? new RoleRepository(pool);
    users.register(userRoutes, {
      prefix: "/api/users",
      userRepository,
      roleRepository,
      ...(options.passwordHasher
        ? { passwordHasher: options.passwordHasher }
        : {}),
    });
    users.register(roleRoutes, { prefix: "/api/roles", roleRepository });
  });
  app.register(async (parameters) => {
    parameters.setErrorHandler(handleParametersError);
    parameters.addHook("onRequest", async (_request, reply) => {
      reply.header("Access-Control-Allow-Origin", "*");
      reply.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      reply.header(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
    });
    const sensorTypeRepository =
      options.sensorTypeRepository ??
      (process.env.NODE_ENV === "test" && !options.database
        ? new InMemorySensorTypeRepository()
        : new PgSensorTypeRepository(pool));
    const sensorRepository =
      options.sensorRepository ??
      (process.env.NODE_ENV === "test" && !options.database
        ? new InMemorySensorRepository()
        : new PgSensorRepository(pool));
    for (const prefix of ["", "/v1", "/api", "/api/v1"]) {
      parameters.register(sensorTypeRoutes, {
        prefix: `${prefix}/sensor-types`,
        repository: sensorTypeRepository,
      });
      parameters.register(sensorRoutes, {
        prefix: `${prefix}/sensors`,
        repository: sensorRepository,
      });
      for (const resource of ["sensor-types", "sensors"]) {
        const preflight = async (_request: unknown, reply: FastifyReply) =>
          reply.status(204).send();
        parameters.options(`${prefix}/${resource}`, preflight);
        parameters.options(`${prefix}/${resource}/*`, preflight);
      }
    }
  });
  app.register(async (stations) => {
    stations.setErrorHandler(handleError);
    const repository =
      options.stationRepository ?? new PgStationRepository(pool);
    const monitoring =
      options.monitoringRepository ?? new PgMonitoringRepository(pool);
    const threshold =
      options.stationOfflineThresholdMinutes ??
      env.STATION_OFFLINE_THRESHOLD_MINUTES;
    stations.get(
      "/api/properties",
      async () => (await repository.listProperties?.()) ?? [],
    );
    stations.register(
      buildStationRoutes(repository, threshold, options.clock),
      { prefix: "/api/stations" },
    );
    const broadcaster =
      options.readingsBroadcaster ??
      new ReadingsBroadcaster(monitoring, {
        intervalMs: env.CURRENT_READINGS_POLL_MS,
        onError: (error) =>
          console.error("[current-readings] falha ao buscar leituras:", error),
      });
    stations.addHook("onClose", async () => {
      await broadcaster.close();
    });
    stations.register(
      buildMonitoringRoutes(monitoring, threshold, options.clock, broadcaster, {
        maxConnections: env.CURRENT_READINGS_MAX_CONNECTIONS,
        ...options.liveLimits,
      }),
      { prefix: "/api/stations" },
    );
    stations.register(
      buildStatisticsRoutes(
        options.statisticsRepository ?? new PgStatisticsRepository(pool),
        options.clock,
      ),
      { prefix: "/api/stations" },
    );
    const forecastProvider =
      options.forecastProvider ??
      new CachedForecastProvider(
        new OpenMeteoProvider({
          baseUrl: env.FORECAST_API_URL,
          timeoutMs: env.FORECAST_TIMEOUT_MS,
        }),
        { ttlMs: env.FORECAST_CACHE_TTL_MINUTES * 60_000 },
      );
    stations.register(
      buildForecastRoutes(
        repository,
        forecastProvider,
        options.clock,
        (error, context) =>
          console.error(
            "[forecast] falha no provedor de previsão:",
            context,
            error,
          ),
      ),
      { prefix: "/api/stations" },
    );
  });
  app.register(async (alerts) => {
    alerts.setErrorHandler(handleError);
    alerts.register(
      buildAlertRoutes(
        options.alertConfigRepository ?? new PgAlertConfigRepository(pool),
        options.triggeredAlertRepository ??
          new PgTriggeredAlertRepository(pool),
      ),
      { prefix: "/api/alerts" },
    );
  });
  app.post("/internal/rules-engine/run", async (_request, reply) => {
    if (!options.rulesEngineWorker) {
      return reply.status(503).send({
        statusCode: 503,
        code: "RULES_ENGINE_UNAVAILABLE",
        message: "Rules engine is not attached to this instance.",
      });
    }
    const result = await options.rulesEngineWorker.runOnce();
    if (result === null) {
      return reply.status(409).send({
        statusCode: 409,
        code: "RULES_ENGINE_BUSY",
        message: "A processing cycle is already running.",
      });
    }
    return result;
  });
  app.addHook("onClose", async () => {
    await options.rulesEngineWorker?.stop();
  });
  return app;
}
