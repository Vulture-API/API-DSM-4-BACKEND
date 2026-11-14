import type { FastifyReply, FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportController } from "@/modules/reports/controllers/report.controller.js";
import { InMemoryReportRepository } from "@/modules/reports/repositories/report.repository.js";
import type { ReportRequestInput } from "@/modules/reports/schemas/report.schema.js";
import { GenerateReportService } from "@/modules/reports/services/generate-report.service.js";

function createReplyMock() {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  return {
    reply: { status } as unknown as FastifyReply,
    status,
    send,
  };
}

describe("ReportController", () => {
  const fixedNow = new Date("2026-11-11T12:00:00.000Z");
  let repository: InMemoryReportRepository;
  let service: GenerateReportService;
  let controller: ReportController;

  beforeEach(() => {
    repository = new InMemoryReportRepository();
    repository.stations = [
      {
        id: 1,
        name: "Estação Sul",
        latitude: -23.18,
        longitude: -45.88,
        property_id: 1,
        property_name: "Fazenda Modelo",
      },
    ];
    repository.properties = [{ id: 1, name: "Fazenda Modelo" }];
    service = new GenerateReportService(repository, () => fixedNow);
    controller = new ReportController(service);
  });

  it("getAvailableTypes retorna catálogo dos três tipos de relatório com status 200", async () => {
    const { reply, status, send } = createReplyMock();

    await controller.getAvailableTypes({} as FastifyRequest, reply);

    expect(status).toHaveBeenCalledWith(200);
    expect(send).toHaveBeenCalledWith({
      types: expect.arrayContaining([
        expect.objectContaining({ type: "history" }),
        expect.objectContaining({ type: "forecast" }),
        expect.objectContaining({ type: "alerts" }),
      ]),
    });
  });

  it("queryReport encaminha request.query para o serviço e responde 200", async () => {
    const { reply, status, send } = createReplyMock();
    const executeSpy = vi.spyOn(service, "execute");
    const request = {
      query: { type: "historico", station_id: 1 },
    } as FastifyRequest<{ Querystring: ReportRequestInput }>;

    await controller.queryReport(request, reply);

    expect(executeSpy).toHaveBeenCalledWith({
      type: "historico",
      station_id: 1,
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        report_type: "history",
        station: { id: 1, name: "Estação Sul" },
      }),
    );
  });

  it("requestReport encaminha request.body para o serviço e responde 200", async () => {
    const { reply, status, send } = createReplyMock();
    const executeSpy = vi.spyOn(service, "execute");
    const request = {
      body: { type: "forecast", station_id: 1, days: 3 },
    } as FastifyRequest<{ Body: ReportRequestInput }>;

    await controller.requestReport(request, reply);

    expect(executeSpy).toHaveBeenCalledWith({
      type: "forecast",
      station_id: 1,
      days: 3,
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        report_type: "forecast",
        source: "Open-Meteo",
      }),
    );
  });
});
