import "@/config/zod.config.js";

import cookie from "@fastify/cookie";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import { handleError } from "@/errors/error-handler.js";

export function buildApp() {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(handleError);
  app.register(cookie);
  const health = async () => ({ status: "ok", rules_engine: false });
  for (const path of ["/health", "/api/health", "/api/v1/health"])
    app.get(path, health);
  app.get("/", async () => ({ name: "AgriTech - Backend", status: "ok" }));
  return app;
}
