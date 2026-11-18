import type { FastifyReply, FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportController } from "@/modules/reports/controllers/report.controller.js";
import { InMemoryReportRepository } from "@/modules/reports/repositories/report.repository.js";
import type {
  ExportReportBodyInput,
  ExportReportQueryInput,
  ReportRequestInput,
} from "@/modules/reports/schemas/report.schema.js";
import { ExportReportService } from "@/modules/reports/services/export-report.service.js";
import { GenerateReportService } from "@/modules/reports/services/generate-report.service.js";

function createReplyMock() {
  const send = vi.fn();
  const chain: {
    header: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  } = {
    header: vi.fn(),
    send,
  };
  chain.header.mockReturnValue(chain);
  const status = vi.fn().mockReturnValue(chain);
  return {
    reply: { status } as unknown as FastifyReply,
    status,
    header: chain.header,
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

  it("exportByQuery gera e envia arquivo para download com headers adequados", async () => {
    repository.readings = [
      {
        id: 1,
        station_id: 1,
        sensor_id: 10,
        sensor_type_id: 1,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        value: 25.5,
        unix_time: Math.floor(Date.parse("2026-11-10T10:00:00.000Z") / 1000),
        data_consistent: true,
      },
    ];
    const exportService = new ExportReportService(service);
    const exportController = new ReportController(service, exportService);
    const { reply, status, header, send } = createReplyMock();
    const request = {
      query: {
        type: "history",
        station_id: 1,
        from: "2026-11-01T00:00:00.000Z",
        to: "2026-11-11T00:00:00.000Z",
        format: "csv",
      },
    } as FastifyRequest<{ Querystring: ExportReportQueryInput }>;

    await exportController.exportByQuery(request, reply);

    expect(status).toHaveBeenCalledWith(200);
    expect(header).toHaveBeenCalledWith(
      "Content-Type",
      "text/csv; charset=utf-8",
    );
    expect(header).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="relatorio-historico-estacao-1-2026-11-01_a_2026-11-11.csv"',
    );
    expect(send).toHaveBeenCalledWith(expect.stringContaining("Temperatura"));
  });

  it("exportByBody exporta relatório já gerado em JSON mantendo filtros e cabeçalhos", async () => {
    const exportService = new ExportReportService(service);
    const exportFromReportSpy = vi.spyOn(exportService, "exportFromReport");
    const exportController = new ReportController(service, exportService);
    const { reply, status, header, send } = createReplyMock();
    const report = {
      report_type: "history",
      generated_at: "2026-11-11T12:00:00.000Z",
      period: {
        from: "2026-11-01T00:00:00.000Z",
        to: "2026-11-10T23:59:59.999Z",
      },
      station: { id: 1, name: "Estação Sul" },
      property: { id: 1, name: "Fazenda Modelo" },
      total_readings: 1,
      summary: [],
      readings: [
        {
          id: 1,
          sensor_id: 10,
          sensor_type_id: 1,
          sensor_type: "Temperatura",
          unit_of_measure: "°C",
          value: 24,
          unix_time: 1794000000,
          date_time: "2026-11-06T21:20:00.000Z",
          data_consistent: true,
        },
      ],
    };
    const request = {
      body: {
        report,
        format: "json",
      },
    } as FastifyRequest<{ Body: ExportReportBodyInput }>;

    await exportController.exportByBody(request, reply);

    expect(exportFromReportSpy).toHaveBeenCalledWith({
      report,
      format: "json",
      allowEmpty: undefined,
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(header).toHaveBeenCalledWith(
      "Content-Type",
      "application/json; charset=utf-8",
    );
    expect(header).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="relatorio-historico-estacao-1-2026-11-01_a_2026-11-10.json"',
    );
    expect(send).toHaveBeenCalledWith(
      expect.stringContaining('"total_records": 1'),
    );
  });
});
