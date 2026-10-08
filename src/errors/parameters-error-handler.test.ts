import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { ApplicationError } from "./application.error.js";
import { handleParametersError } from "./handlers/parameters.js";

describe("handleParametersError", () => {
  function createMockReply() {
    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
    return reply as unknown as FastifyReply;
  }

  it("deve tratar erro de validação (FastifyError com validation)", () => {
    const reply = createMockReply();
    const error = {
      validation: [
        { instancePath: "/name", message: "must be string" },
        { message: "custom error" },
      ],
    } as unknown as FastifyError;

    handleParametersError(error, {} as FastifyRequest, reply);

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      code: 400,
      message: "Bad request - validation error",
      details: ["/name: must be string", "field: custom error"],
    });
  });

  it("deve tratar ApplicationError com status e detalhes específicos", () => {
    const reply = createMockReply();
    const error = new ApplicationError(409, "Recurso em conflito", [
      "detalhe 1",
    ]);

    handleParametersError(
      error as unknown as FastifyError,
      {} as FastifyRequest,
      reply,
    );

    expect(reply.status).toHaveBeenCalledWith(409);
    expect(reply.send).toHaveBeenCalledWith({
      code: 409,
      message: "Recurso em conflito",
      details: ["detalhe 1"],
    });
  });

  it("deve tratar erros genéricos e desconhecidos como 500", () => {
    const reply = createMockReply();
    const error = new Error("Database crashed") as unknown as FastifyError;

    handleParametersError(error, {} as FastifyRequest, reply);

    expect(reply.status).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({
      code: 500,
      message: "Internal server error",
      details: [],
    });
  });
});
