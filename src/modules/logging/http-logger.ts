import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import {
  type AuditAction,
  type AuditCategory,
  type AuditResult,
  AuditService,
} from "./audit-logger.js";
import { type AppLogger } from "./logger.js";
import { sanitizeHeaders, sanitizeLogData } from "./sanitizer.js";

/**
 * Determina a categoria de auditoria com base na URL da requisição.
 */
export function determineAuditCategory(url: string): AuditCategory {
  if (url.includes("/auth")) return "AUTHENTICATION";
  if (url.includes("/users")) return "USER_MANAGEMENT";
  if (url.includes("/roles") || url.includes("/permissions")) {
    return "ACCESS_CONTROL";
  }
  if (url.includes("/internal/") || url.includes("/devops/outages")) {
    return "SYSTEM";
  }
  return "ENTITY_MUTATION";
}

/**
 * Determina a ação de auditoria com base no método HTTP e na URL.
 */
export function determineAuditAction(method: string, url: string): AuditAction {
  if (url.includes("/login")) return "LOGIN";
  if (url.includes("/logout")) return "LOGOUT";
  if (url.includes("/block")) return "BLOCK";
  if (url.includes("/unblock")) return "UNBLOCK";
  if (method === "POST") return url.includes("/run") ? "EXECUTE" : "CREATE";
  if (method === "PUT" || method === "PATCH") return "UPDATE";
  if (method === "DELETE") return "DELETE";
  return "UPDATE";
}

/**
 * Extrai o tipo de entidade alvo da URL.
 */
export function determineTargetType(url: string): string {
  const segments = url.split("?")[0]?.split("/").filter(Boolean) ?? [];
  // Remove prefixos comuns como api, v1
  const filtered = segments.filter((s) => s !== "api" && s !== "v1");
  const first = filtered[0];
  return typeof first === "string" ? first : "unknown";
}

/**
 * Registra erro HTTP de forma estruturada e padronizada.
 */
export function logHttpError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
  component = "http",
): void {
  const operation = `${request.method} ${request.routeOptions?.url ?? request.url}`;
  const statusCode =
    reply.statusCode >= 400 ? reply.statusCode : (error.statusCode ?? 500);
  const isClientError = statusCode < 500;
  const level = isClientError ? "warn" : "error";

  const errorPayload = {
    component,
    operation,
    requestId: request.id,
    result: "error",
    statusCode,
    actor: request.actor
      ? {
          id: request.actor.id,
          email: request.actor.email,
        }
      : undefined,
    error: {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack,
    },
    params: sanitizeLogData(request.params),
    query: sanitizeLogData(request.query),
  };

  const logMap = request.log as unknown as
    | Record<string, ((payload: unknown, msg: string) => void) | undefined>
    | undefined;
  const logFn = logMap?.[level];

  if (typeof logFn === "function") {
    logFn.call(
      request.log,
      errorPayload,
      `Request failed with error: ${error.message}`,
    );
  } else if (request.log && typeof request.log.error === "function") {
    request.log.error(
      errorPayload,
      `Request failed with error: ${error.message}`,
    );
  }
}

/**
 * Configura hooks globais de logging estruturado e auditoria no Fastify.
 */
export function setupHttpLogging(
  app: FastifyInstance,
  options: {
    logger?: AppLogger | undefined;
    auditService?: AuditService | undefined;
  } = {},
): void {
  const auditService = options.auditService ?? AuditService.getInstance();

  // onRequest: Registra requisição recebida
  app.addHook("onRequest", async (request) => {
    request.metricsStartTime = performance.now();
    const route = request.routeOptions?.url ?? request.url;
    request.log.info(
      {
        component: "http",
        operation: `${request.method} ${route}`,
        requestId: request.id,
        method: request.method,
        url: request.url,
        ip: request.ip,
        userAgent: request.headers["user-agent"],
        headers: sanitizeHeaders(request.headers),
      },
      `Incoming request: ${request.method} ${request.url}`,
    );
  });

  // onSend: Adiciona o cabeçalho x-request-id na resposta para correlação cliente/servidor
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  // onResponse: Registra conclusão da requisição e evento de auditoria se aplicável
  app.addHook("onResponse", async (request, reply) => {
    const start = request.metricsStartTime ?? performance.now();
    const durationMs = Number((performance.now() - start).toFixed(2));
    const route = request.routeOptions?.url ?? request.url;
    const isSuccess = reply.statusCode < 400;

    request.log.info(
      {
        component: "http",
        operation: `${request.method} ${route}`,
        requestId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs,
        result: isSuccess ? "success" : "error",
      },
      `Request completed: ${request.method} ${request.url} - ${reply.statusCode} (${durationMs}ms)`,
    );

    // Auditoria para operações de mutação (POST, PUT, PATCH, DELETE) ou autenticação
    const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(
      request.method,
    );
    const isAuth = request.url.includes("/auth");

    if (isMutation || isAuth) {
      // Ignora healthchecks e requisições OPTIONS
      if (
        request.url.includes("/health") ||
        request.url.includes("/ping") ||
        request.method === "OPTIONS"
      ) {
        return;
      }

      const category = determineAuditCategory(request.url);
      const action = determineAuditAction(request.method, request.url);
      const targetType = determineTargetType(request.url);
      const params = request.params as Record<string, unknown> | undefined;
      const targetId = params?.id as string | number | undefined;

      let result: AuditResult = isSuccess ? "SUCCESS" : "FAILURE";
      if (reply.statusCode === 401 || reply.statusCode === 403) {
        result = "DENIED";
      }

      const body = request.body as Record<string, unknown> | undefined;
      const email =
        request.actor?.email ??
        (typeof body?.email === "string" ? body.email : undefined);

      auditService.record({
        category,
        action,
        operation: `${request.method} ${route}`,
        actor: {
          id: request.actor?.id,
          email,
          ip: request.ip,
        },
        target: {
          type: targetType,
          id: targetId,
        },
        result,
        requestId: request.id,
        details: {
          statusCode: reply.statusCode,
          durationMs,
          params: sanitizeLogData(request.params),
          query: sanitizeLogData(request.query),
          body: sanitizeLogData(request.body),
        },
      });
    }
  });
}
