import "@/config/zod.config.js";

import cookie from "@fastify/cookie";
import Fastify, { type FastifyReply } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { Pool } from "pg";

import { database } from "@/config/database.js";
import { handleError } from "@/errors/error-handler.js";
import { handleParametersError } from "@/errors/handlers/parameters.js";
import { handleUsersError } from "@/errors/handlers/users.js";
import {
  RoleRepository,
  type RoleRepositoryPort,
} from "@/modules/roles/repositories/role.repository.js";
import { roleRoutes } from "@/modules/roles/routes/roles.route.js";
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
import {
  UserRepository,
  type UserRepositoryPort,
} from "@/modules/users/repositories/user.repository.js";
import { userRoutes } from "@/modules/users/routes/users.route.js";
import type { PasswordHasher } from "@/modules/users/services/password-hasher.js";

export type BuildAppOptions = {
  database?: Pool;
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
  const health = async () => ({ status: "ok", rules_engine: false });
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
      (process.env.NODE_ENV === "test"
        ? new InMemorySensorTypeRepository()
        : new PgSensorTypeRepository(pool));
    const sensorRepository =
      options.sensorRepository ??
      (process.env.NODE_ENV === "test"
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
  return app;
}
