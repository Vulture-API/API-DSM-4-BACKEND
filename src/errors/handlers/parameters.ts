import {
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import { ApplicationError } from "@/errors/application.error.js";
import { authorizationErrorBody } from "@/errors/handlers/authorization.js";
import { logHttpError } from "@/modules/logging/http-logger.js";

export function handleParametersError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  logHttpError(error, request, reply, "parameters");

  const denial = authorizationErrorBody(error);
  if (denial) return reply.status(denial.code).send(denial);

  if (error.validation) {
    const details = error.validation.map(
      (v) => `${v.instancePath || "field"}: ${v.message}`,
    );

    return reply.status(400).send({
      code: 400,
      message: "Bad request - validation error",
      details,
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
    details: [],
  });
}
