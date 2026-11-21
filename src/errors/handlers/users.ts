import {
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import { env } from "@/config/environment.js";
import { ApplicationError } from "@/errors/application.error.js";
import { authorizationErrorBody } from "@/errors/handlers/authorization.js";
import { logHttpError } from "@/modules/logging/http-logger.js";

export function handleUsersError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  logHttpError(error, request, reply, "users");

  const denial = authorizationErrorBody(error);
  if (denial) return reply.status(denial.code).send(denial);

  if (error.validation) {
    return reply.status(400).send({
      code: 400,
      message: "Invalid data",
      details: error.validation.map((issue) => issue.message),
    });
  }

  if (error instanceof ApplicationError) {
    return reply.status(error.statusCode).send({
      code: error.statusCode,
      message: error.message,
      details: error.details,
    });
  }

  // Erros 4xx do Fastify (JSON malformado, corpo grande demais...).
  const status = (error as { statusCode?: number }).statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return reply.status(status).send({
      code: status,
      message:
        status === 413 ? "Payload too large" : "Malformed or invalid request",
      details: [],
    });
  }

  return reply.status(500).send({
    code: 500,
    message: "Internal server error",
    details: env.NODE_ENV === "development" ? [error.message] : [],
  });
}
