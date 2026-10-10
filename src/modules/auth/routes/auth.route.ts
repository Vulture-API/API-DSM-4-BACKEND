import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { JWT_TTL_SECONDS, WS_COOKIE } from "@/modules/auth/access-control.js";
import { AuthUnavailableError } from "@/modules/auth/auth.errors.js";
import type { AuthRepositoryPort } from "@/modules/auth/repositories/auth.repository.js";
import {
  loginSchema,
  tokenSchema,
} from "@/modules/auth/schemas/auth.schema.js";
import { LoginService } from "@/modules/auth/services/login.service.js";

export const authRoutes: FastifyPluginAsyncZod<{
  repository: AuthRepositoryPort;
  configured: boolean;
  secureCookie: boolean;
  loginRateLimitMax: number;
  rateLimitWindowMs: number;
}> = async (app, options) => {
  const loginService = new LoginService(options.repository);
  app.post(
    "/login",
    {
      config: {
        access: { public: true },
        rateLimit: {
          max: options.loginRateLimitMax,
          timeWindow: options.rateLimitWindowMs,
        },
      },
      schema: { body: loginSchema, response: { 200: tokenSchema } },
    },
    async (request, reply) => {
      if (!options.configured) throw new AuthUnavailableError();
      const user = await loginService.login(
        request.body.email,
        request.body.password,
      );
      const token = app.jwt.sign({ sub: String(user.id) });
      reply.header("Cache-Control", "no-store");
      reply.setCookie(WS_COOKIE, token, {
        path: "/api/stations/current/ws",
        httpOnly: true,
        sameSite: "lax",
        secure: options.secureCookie,
        maxAge: JWT_TTL_SECONDS,
      });
      return {
        access_token: token,
        token_type: "Bearer" as const,
        expires_in: JWT_TTL_SECONDS,
      };
    },
  );
  app.get(
    "/me",
    { config: { access: { always: true } } },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      return request.actor;
    },
  );
};
