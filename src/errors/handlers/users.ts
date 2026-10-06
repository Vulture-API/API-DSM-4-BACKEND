import {
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import { env } from "@/config/environment.js";
import { ApplicationError } from "@/errors/application.error.js";

export function handleUsersError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  request.log.error(error);

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

  return reply.status(500).send({
    code: 500,
    message: "Internal server error",
    details: env.NODE_ENV === "development" ? [error.message] : [],
  });
}
