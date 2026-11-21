import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "@/app.js";
import { FakeAuthRepository } from "@/modules/auth/testing/fake-auth.repository.js";
import { InMemoryReportRepository } from "@/modules/reports/repositories/report.repository.js";

const FIXED_NOW = new Date("2026-10-20T12:00:00.000Z");

function toUnixSeconds(isoDateTime: string): number {
  return Math.floor(Date.parse(isoDateTime) / 1000);
}

function createUnexpectedPool(): Pool {
  return {
    query: vi.fn(() => {
      throw new Error("PostgreSQL nao deve ser consultado no teste em memoria");
    }),
    connect: vi.fn(() => {
      throw new Error("PostgreSQL nao deve ser conectado no teste em memoria");
    }),
  } as unknown as Pool;
}

function createSeededRepository(): InMemoryReportRepository {
  const repository = new InMemoryReportRepository();
  repository.properties = [{ id: 10, name: "Fazenda Sol Nascente" }];
  repository.stations = [
    {
      id: 1,
      name: "Estacao Norte",
      latitude: -23.1896,
      longitude: -45.8841,
      property_id: 10,
      property_name: "Fazenda Sol Nascente",
    },
  ];
  repository.readings = [
    {
      id: 1,
      station_id: 1,
      sensor_id: 101,
      sensor_type_id: 1,
      sensor_type: "Temperatura",
      unit_of_measure: "°C",
      value: 19.5,
      unix_time: toUnixSeconds("2026-09-28T12:00:00.000Z"),
      data_consistent: true,
    },
    {
      id: 2,
      station_id: 1,
      sensor_id: 101,
      sensor_type_id: 1,
      sensor_type: "Temperatura",
      unit_of_measure: "°C",
      value: 24.5,
      unix_time: toUnixSeconds("2026-10-03T08:00:00.000Z"),
      data_consistent: true,
    },
    {
      id: 3,
      station_id: 1,
      sensor_id: 101,
      sensor_type_id: 1,
      sensor_type: "Temperatura",
      unit_of_measure: "°C",
      value: 28.0,
      unix_time: toUnixSeconds("2026-10-08T18:30:00.000Z"),
      data_consistent: false,
    },
  ];
  repository.alerts = [
    {
      id: 20,
      station_id: 1,
      station_name: "Estacao Norte",
      sensor_id: 101,
      sensor_type: "Temperatura",
      unit_of_measure: "°C",
      rule_name: "Calor extremo",
      condition: "> 27",
      threshold_value: 27,
      reading_value: 28,
      triggered_at: "2026-10-08T18:35:00.000Z",
      status: "pending",
    },
  ];
  repository.forecastDays = [
    {
      date: "2026-10-20",
      temperature_max: 29,
      temperature_min: 18,
      precipitation_mm: 2.5,
      precipitation_probability: 40,
      wind_speed_max_kmh: 15,
      weather_code: 2,
    },
  ];
  return repository;
}

describe("integracao da exportacao de relatorios (/api/reports/export)", () => {
  let app: FastifyInstance;
  let repository: InMemoryReportRepository;

  beforeEach(async () => {
    repository = createSeededRepository();
    app = buildApp({
      database: createUnexpectedPool(),
      reportRepository: repository,
      accessControlEnabled: false,
      clock: () => FIXED_NOW,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("POST /api/reports/export exporta relatorio ja gerado em CSV preservando dados, filtros e headers de download", async () => {
    const generated = await app.inject({
      method: "GET",
      url: "/api/reports?type=history&station_id=1&from=2026-10-01&to=2026-10-10",
    });
    expect(generated.statusCode).toBe(200);
    const report = generated.json();

    const exported = await app.inject({
      method: "POST",
      url: "/api/reports/export",
      payload: {
        report,
        format: "csv",
      },
    });

    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(exported.headers["content-disposition"]).toBe(
      'attachment; filename="relatorio-historico-estacao-1-2026-10-01_a_2026-10-10.csv"',
    );

    expect(exported.body.startsWith("\uFEFF")).toBe(true);
    const lines = exported.body.slice(1).split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('"ID Leitura";"Estação";"Propriedade"');
    expect(lines[1]).toContain('"2";"Estacao Norte";"Fazenda Sol Nascente"');
    expect(lines[1]).toContain('"24.5";"°C"');
    expect(lines[2]).toContain('"3";"Estacao Norte";"Fazenda Sol Nascente"');
    expect(lines[2]).toContain('"Não"');
  });

  it("POST /api/reports/export exporta relatorio ja gerado em JSON estruturado preservando filtros", async () => {
    const generated = await app.inject({
      method: "GET",
      url: "/api/reports?type=history&station_id=1&from=2026-10-01&to=2026-10-10",
    });
    const report = generated.json();

    const exported = await app.inject({
      method: "POST",
      url: "/api/reports/export",
      payload: {
        report,
        format: "json",
      },
    });

    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-type"]).toBe(
      "application/json; charset=utf-8",
    );
    expect(exported.headers["content-disposition"]).toBe(
      'attachment; filename="relatorio-historico-estacao-1-2026-10-01_a_2026-10-10.json"',
    );

    const parsed = JSON.parse(exported.body);
    expect(parsed).toMatchObject({
      report_type: "history",
      generated_at: report.generated_at,
      total_records: 2,
      filters: {
        report_type: "history",
        period: {
          from: "2026-10-01T00:00:00.000Z",
          to: "2026-10-10T23:59:59.999Z",
        },
        station: { id: 1, name: "Estacao Norte" },
        property: { id: 10, name: "Fazenda Sol Nascente" },
      },
    });
    expect(parsed.data).toHaveLength(2);
    expect(parsed.summary).toHaveLength(1);
  });

  it("GET /api/reports/export e POST /api/reports/export geram e exportam diretamente por filtros", async () => {
    const csvAlerts = await app.inject({
      method: "GET",
      url: "/api/reports/export?type=alerts&station_id=1&from=2026-10-01&to=2026-10-10&format=csv",
    });
    expect(csvAlerts.statusCode).toBe(200);
    expect(csvAlerts.headers["content-disposition"]).toBe(
      'attachment; filename="relatorio-alertas-estacao-1-2026-10-01_a_2026-10-10.csv"',
    );
    expect(csvAlerts.body).toContain('"Calor extremo"');

    const jsonForecast = await app.inject({
      method: "POST",
      url: "/api/reports/export",
      payload: {
        type: "forecast",
        station_id: 1,
        days: 1,
        format: "json",
      },
    });
    expect(jsonForecast.statusCode).toBe(200);
    expect(jsonForecast.headers["content-disposition"]).toContain(
      "relatorio-previsao-estacao-1-",
    );
    const parsed = JSON.parse(jsonForecast.body);
    expect(parsed.report_type).toBe("forecast");
    expect(parsed.total_records).toBe(1);
    expect(parsed.data[0]["Condição"]).toBe("Parcialmente nublado");
  });

  it("trata ausencia de dados com 422 por padrao e permite exportacao vazia com allow_empty=true", async () => {
    const emptyBlocked = await app.inject({
      method: "GET",
      url: "/api/reports/export?type=history&from=2026-11-01&to=2026-11-05&format=csv",
    });
    expect(emptyBlocked.statusCode).toBe(422);
    expect(emptyBlocked.json().code).toBe("EMPTY_REPORT_FOR_EXPORT");

    const emptyAllowed = await app.inject({
      method: "GET",
      url: "/api/reports/export?type=history&from=2026-11-01&to=2026-11-05&format=csv&allow_empty=true",
    });
    expect(emptyAllowed.statusCode).toBe(200);
    expect(emptyAllowed.headers["content-type"]).toBe(
      "text/csv; charset=utf-8",
    );
    const lines = emptyAllowed.body.slice(1).split("\r\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"ID Leitura"');
  });

  it.each([
    [
      "formato nao suportado via GET",
      {
        method: "GET" as const,
        url: "/api/reports/export?type=history&from=2026-10-01&to=2026-10-10&format=pdf",
      },
      400,
      "INVALID_EXPORT_FORMAT",
    ],
    [
      "formato ausente via GET",
      {
        method: "GET" as const,
        url: "/api/reports/export?type=history&from=2026-10-01&to=2026-10-10",
      },
      400,
      "INVALID_EXPORT_FORMAT",
    ],
    [
      "payload de report malformado via POST",
      {
        method: "POST" as const,
        url: "/api/reports/export",
        payload: { report: { invalid: true }, format: "csv" },
      },
      400,
      "INVALID_EXPORT_REPORT",
    ],
    [
      "mistura de report ja gerado com filtros via POST",
      {
        method: "POST" as const,
        url: "/api/reports/export",
        payload: {
          report: { report_type: "history" },
          type: "history",
          format: "csv",
        },
      },
      400,
      "VALIDATION_ERROR",
    ],
    [
      "parametro desconhecido via POST strict",
      {
        method: "POST" as const,
        url: "/api/reports/export",
        payload: { type: "history", format: "csv", extra: true },
      },
      400,
      "VALIDATION_ERROR",
    ],
    [
      "periodo invertido via GET",
      {
        method: "GET" as const,
        url: "/api/reports/export?type=history&from=2026-10-10&to=2026-10-01&format=csv",
      },
      400,
      "INVALID_REPORT_PERIOD",
    ],
    [
      "estacao inexistente via GET",
      {
        method: "GET" as const,
        url: "/api/reports/export?type=history&station_id=999&format=json",
      },
      404,
      "STATION_NOT_FOUND",
    ],
  ])(
    "trata falhas e entradas invalidas (%s)",
    async (_label, request, expectedStatus, expectedCode) => {
      const response = await app.inject(request);

      expect(response.statusCode).toBe(expectedStatus);
      expect(response.json().code).toBe(expectedCode);
    },
  );
});

describe("controle de acesso nas rotas de exportacao (/api/reports/export)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const authRepository = new FakeAuthRepository();
    authRepository.credentials.push(
      {
        id: 1,
        role_id: 2,
        role_name: "Gerente Agricola",
        name: "Carlos Mendes",
        email: "carlos.mendes@agritech.dev",
        active: true,
        created_at: "2026-09-01T00:00:00.000Z",
        password_hash: "unused",
        permissions: ["monitoring.read"],
        property_ids: [10],
      },
      {
        id: 2,
        role_id: 3,
        role_name: "Sem Acesso",
        name: "Sem Permissao",
        email: "sem.permissao@agritech.dev",
        active: true,
        created_at: "2026-09-01T00:00:00.000Z",
        password_hash: "unused",
        permissions: [],
        property_ids: [],
      },
    );

    app = buildApp({
      database: createUnexpectedPool(),
      jwtSecret: "scrum-566-export-access-control-test-secret",
      accessControlEnabled: true,
      authRepository,
      reportRepository: createSeededRepository(),
      clock: () => FIXED_NOW,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("permite exportacao ao Gerente Agricola com monitoring.read e nega anonimo/sem permissao", async () => {
    const anonymous = await app.inject({
      method: "POST",
      url: "/api/reports/export",
      payload: {
        type: "history",
        from: "2026-10-01",
        to: "2026-10-10",
        format: "csv",
      },
    });
    expect(anonymous.statusCode).toBe(401);

    const forbiddenToken = app.jwt.sign({ sub: "2" });
    const forbidden = await app.inject({
      method: "GET",
      url: "/api/reports/export?type=history&from=2026-10-01&to=2026-10-10&format=csv",
      headers: { authorization: `Bearer ${forbiddenToken}` },
    });
    expect(forbidden.statusCode).toBe(403);

    const allowedToken = app.jwt.sign({ sub: "1" });
    const allowed = await app.inject({
      method: "POST",
      url: "/api/reports/export",
      headers: { authorization: `Bearer ${allowedToken}` },
      payload: {
        type: "history",
        from: "2026-10-01",
        to: "2026-10-10",
        format: "json",
      },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.headers["content-disposition"]).toContain(".json");
  });
});
