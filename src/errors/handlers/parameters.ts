import {
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import { ApplicationError } from "@/errors/application.error.js";

export function handleParametersError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
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

  return reply.status(500).send({
    code: 500,
    message: "Internal server error",
    details: [],
  });
}
