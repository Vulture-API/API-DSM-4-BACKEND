import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { env } from "@/config/environment.js";
import { ApplicationError } from "@/errors/application.error.js";
import { handleError } from "@/errors/error-handler.js";
import { handleParametersError } from "@/errors/handlers/parameters.js";
import { handleUsersError } from "@/errors/handlers/users.js";
import {
  ForbiddenError,
  UnauthorizedError,
} from "@/modules/auth/auth.errors.js";

const initialEnvironment = env.NODE_ENV;
afterEach(() => {
  env.NODE_ENV = initialEnvironment;
});

describe.each([
  { name: "common", handler: handleError },
  { name: "parameters", handler: handleParametersError },
  { name: "users", handler: handleUsersError },
])("authorization error contract: $name", ({ handler }) => {
  it.each([
    { name: "401 UnauthorizedError", ErrorType: UnauthorizedError },
    { name: "403 ForbiddenError", ErrorType: ForbiddenError },
  ])(
    "returns only the common denial body for $name even in development",
    ({ ErrorType }) => {
      env.NODE_ENV = "development";
      const error = new ErrorType();
      error.details = ["Internal detail must not be exposed"];
      const reply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
      };
      handler(
        error as FastifyError,
        { log: { error: vi.fn() } } as unknown as FastifyRequest,
        reply as unknown as FastifyReply,
      );
      expect(reply.status).toHaveBeenCalledWith(error.statusCode);
      expect(reply.send).toHaveBeenCalledExactlyOnceWith({
        code: error.statusCode,
        message: error.message,
        details: [],
      });
    },
  );

  it("preserves unrelated application errors and their domain contract", () => {
    const error = new ApplicationError(409, "CONFLICT", "Conflict");
    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    handler(
      error as FastifyError,
      { log: { error: vi.fn() } } as unknown as FastifyRequest,
      reply as unknown as FastifyReply,
    );
    expect(reply.status).toHaveBeenCalledWith(409);
    expect(reply.send).toHaveBeenCalledExactlyOnceWith(
      handler === handleError
        ? { statusCode: 409, code: "CONFLICT", message: "Conflict" }
        : { code: 409, message: "Conflict", details: [] },
    );
  });
});
