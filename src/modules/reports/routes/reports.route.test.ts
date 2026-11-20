import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "@/app.js";
import { FakeAuthRepository } from "@/modules/auth/testing/fake-auth.repository.js";
import {
  InMemoryReportRepository,
  type ReportReadingRow,
} from "@/modules/reports/repositories/report.repository.js";

const FIXED_NOW = new Date("2026-10-20T12:00:00.000Z");

function toUnixSeconds(isoDateTime: string): number {
  return Math.floor(Date.parse(isoDateTime) / 1000);
}

function createReading(
  overrides: Partial<ReportReadingRow> & Pick<ReportReadingRow, "id" | "value">,
  isoDateTime: string,
): ReportReadingRow {
  return {
    sensor_id: 101,
    station_id: 1,
    sensor_type_id: 1,
    sensor_type: "Temperatura",
    unit_of_measure: "°C",
    unix_time: toUnixSeconds(isoDateTime),
    data_consistent: true,
    ...overrides,
  };
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
    {
      id: 2,
      name: "Estacao Sul",
      latitude: -23.21,
      longitude: -45.89,
      property_id: 10,
      property_name: "Fazenda Sol Nascente",
    },
  ];
  repository.readings = [
    createReading({ id: 1, value: 18 }, "2026-09-28T12:00:00.000Z"),
    createReading({ id: 2, value: 24 }, "2026-10-03T08:00:00.000Z"),
    createReading({ id: 3, value: 28 }, "2026-10-08T18:30:00.000Z"),
    createReading({ id: 4, value: 33 }, "2026-10-15T10:00:00.000Z"),
  ];
  repository.alerts = [
    {
      id: 10,
      station_id: 1,
      station_name: "Estacao Norte",
      sensor_id: 101,
      sensor_type: "Temperatura",
      unit_of_measure: "°C",
      rule_name: "Calor excessivo",
      condition: "> 30",
      threshold_value: 30,
      reading_value: 31,
      triggered_at: "2026-09-29T10:00:00.000Z",
      status: "pending",
    },
    {
      id: 11,
      station_id: 1,
      station_name: "Estacao Norte",
      sensor_id: 101,
      sensor_type: "Temperatura",
      unit_of_measure: "°C",
      rule_name: "Calor excessivo",
      condition: "> 30",
      threshold_value: 30,
      reading_value: 32,
      triggered_at: "2026-10-05T14:00:00.000Z",
      status: "acknowledged",
    },
    {
      id: 12,
      station_id: 1,
      station_name: "Estacao Norte",
      sensor_id: 101,
      sensor_type: "Temperatura",
      unit_of_measure: "°C",
      rule_name: "Calor excessivo",
      condition: "> 30",
      threshold_value: 30,
      reading_value: 34,
      triggered_at: "2026-10-12T09:00:00.000Z",
      status: "pending",
    },
  ];
  return repository;
}

describe("integracao em memoria das rotas de relatorios (/api/reports)", () => {
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

  it("GET /api/reports retorna somente leituras do periodo selecionado no relatorio history", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/reports?type=history&from=2026-10-01&to=2026-10-10",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body).toMatchObject({
      report_type: "history",
      generated_at: "2026-10-20T12:00:00.000Z",
      period: {
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-10T23:59:59.999Z",
      },
      station: null,
      property: null,
      total_readings: 2,
    });

    const returnedIds = body.readings.map((item: { id: number }) => item.id);
    expect(returnedIds).toEqual([2, 3]);
    expect(returnedIds).not.toContain(1);
    expect(returnedIds).not.toContain(4);

    expect(body.readings).toEqual([
      expect.objectContaining({
        id: 2,
        value: 24,
        date_time: "2026-10-03T08:00:00.000Z",
      }),
      expect.objectContaining({
        id: 3,
        value: 28,
        date_time: "2026-10-08T18:30:00.000Z",
      }),
    ]);

    expect(body.summary).toEqual([
      {
        sensor_type_id: 1,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        count: 2,
        avg: 26,
        min: 24,
        max: 28,
        stddev: 2,
        accumulated: null,
      },
    ]);
  });

  it("respeita os limites exatos do inicio e fim do periodo em UTC", async () => {
    repository.readings = [
      createReading({ id: 10, value: 19 }, "2026-09-30T23:59:59.000Z"),
      createReading({ id: 11, value: 21 }, "2026-10-01T00:00:00.000Z"),
      createReading({ id: 12, value: 25 }, "2026-10-10T23:59:59.000Z"),
      createReading({ id: 13, value: 29 }, "2026-10-11T00:00:00.000Z"),
    ];

    const response = await app.inject({
      method: "GET",
      url: "/api/reports?type=history&from=2026-10-01&to=2026-10-10",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total_readings).toBe(2);
    expect(body.readings.map((item: { id: number }) => item.id)).toEqual([
      11, 12,
    ]);
  });

  it("aceita periodo de um unico dia e datetimes ISO com fuso horario", async () => {
    repository.readings = [
      createReading({ id: 20, value: 20 }, "2026-10-03T02:59:59.000Z"),
      createReading({ id: 21, value: 22 }, "2026-10-03T03:00:00.000Z"),
      createReading({ id: 22, value: 26 }, "2026-10-04T02:59:59.000Z"),
      createReading({ id: 23, value: 27 }, "2026-10-04T03:00:00.000Z"),
    ];

    const sameDay = await app.inject({
      method: "GET",
      url: "/api/reports?type=history&from=2026-10-03&to=2026-10-03",
    });
    expect(sameDay.statusCode).toBe(200);
    expect(
      sameDay.json().readings.map((item: { id: number }) => item.id),
    ).toEqual([20, 21]);

    const withOffset = await app.inject({
      method: "GET",
      url: "/api/reports?type=history&from=2026-10-03T00:00:00-03:00&to=2026-10-03T23:59:59-03:00",
    });
    expect(withOffset.statusCode).toBe(200);
    expect(
      withOffset.json().readings.map((item: { id: number }) => item.id),
    ).toEqual([21, 22]);
  });

  it("combina filtro de periodo com station_id sem vazar leituras de outra estacao", async () => {
    repository.readings.push(
      createReading(
        { id: 5, station_id: 2, sensor_id: 201, value: 25 },
        "2026-10-05T12:00:00.000Z",
      ),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/reports?type=history&station_id=1&from=2026-10-01&to=2026-10-10",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.station).toEqual({ id: 1, name: "Estacao Norte" });
    expect(body.property).toEqual({ id: 10, name: "Fazenda Sol Nascente" });
    expect(body.total_readings).toBe(2);
    expect(body.readings.map((item: { id: number }) => item.id)).toEqual([
      2, 3,
    ]);
  });

  it("retorna relatorio vazio com status 200 quando nao ha leituras no periodo", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/reports?type=history&from=2026-11-01&to=2026-11-05",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      report_type: "history",
      total_readings: 0,
      summary: [],
      readings: [],
    });
  });

  it("usa a janela padrao de 7 dias quando from e to sao omitidos", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/reports?type=history",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.period).toEqual({
      from: "2026-10-13T12:00:00.000Z",
      to: "2026-10-20T12:00:00.000Z",
    });
    expect(body.readings.map((item: { id: number }) => item.id)).toEqual([4]);
  });

  it("aplica o mesmo filtro de periodo via POST /api/reports, em alertas e lista catalogo em /types", async () => {
    const postHistory = await app.inject({
      method: "POST",
      url: "/api/reports",
      payload: {
        type: "history",
        from: "2026-10-01",
        to: "2026-10-10",
      },
    });
    expect(postHistory.statusCode).toBe(200);
    expect(
      postHistory.json().readings.map((item: { id: number }) => item.id),
    ).toEqual([2, 3]);

    const alerts = await app.inject({
      method: "GET",
      url: "/api/reports?type=alerts&from=2026-10-01&to=2026-10-10",
    });
    expect(alerts.statusCode).toBe(200);
    expect(alerts.json().total_alerts).toBe(1);
    expect(alerts.json().alerts[0].id).toBe(11);

    const catalog = await app.inject({
      method: "GET",
      url: "/api/reports/types",
    });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().types).toHaveLength(3);
  });

  it("consolida resumo multi-sensor, chuva acumulada e ordenacao crescente no relatorio history", async () => {
    repository.readings.push(
      createReading(
        {
          id: 9,
          sensor_id: 102,
          sensor_type_id: 2,
          sensor_type: "Índice Pluviométrico",
          unit_of_measure: "mm",
          value: 4.2,
        },
        "2026-10-06T12:00:00.000Z",
      ),
      createReading(
        {
          id: 8,
          sensor_id: 102,
          sensor_type_id: 2,
          sensor_type: "Índice Pluviométrico",
          unit_of_measure: "mm",
          value: 5.8,
        },
        "2026-10-04T12:00:00.000Z",
      ),
      createReading(
        {
          id: 10,
          sensor_id: 103,
          sensor_type_id: 3,
          sensor_type: "Umidade",
          unit_of_measure: "%",
          value: 68,
        },
        "2026-10-05T12:00:00.000Z",
      ),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/reports?type=history&from=2026-10-01&to=2026-10-10",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total_readings).toBe(5);
    expect(body.readings.map((item: { id: number }) => item.id)).toEqual([
      2, 8, 10, 9, 3,
    ]);
    expect(body.summary).toEqual([
      {
        sensor_type_id: 1,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        count: 2,
        avg: 26,
        min: 24,
        max: 28,
        stddev: 2,
        accumulated: null,
      },
      {
        sensor_type_id: 2,
        sensor_type: "Índice Pluviométrico",
        unit_of_measure: "mm",
        count: 2,
        avg: 5,
        min: 4.2,
        max: 5.8,
        stddev: 0.8,
        accumulated: 10,
      },
      {
        sensor_type_id: 3,
        sensor_type: "Umidade",
        unit_of_measure: "%",
        count: 1,
        avg: 68,
        min: 68,
        max: 68,
        stddev: null,
        accumulated: null,
      },
    ]);
  });

  it("filtra historico e alertas por property_id isolando outra propriedade", async () => {
    repository.properties.push({ id: 20, name: "Fazenda Boa Vista" });
    repository.stations.push({
      id: 3,
      name: "Estacao Leste",
      latitude: -23.3,
      longitude: -45.9,
      property_id: 20,
      property_name: "Fazenda Boa Vista",
    });
    repository.readings.push(
      createReading(
        { id: 5, station_id: 2, sensor_id: 201, value: 25 },
        "2026-10-04T12:00:00.000Z",
      ),
      createReading(
        { id: 6, station_id: 3, sensor_id: 301, value: 30 },
        "2026-10-04T12:00:00.000Z",
      ),
    );
    repository.alerts.push({
      id: 13,
      station_id: 3,
      station_name: "Estacao Leste",
      sensor_id: 301,
      sensor_type: "Temperatura",
      unit_of_measure: "°C",
      rule_name: "Calor excessivo",
      condition: "> 30",
      threshold_value: 30,
      reading_value: 36,
      triggered_at: "2026-10-06T14:00:00.000Z",
      status: "pending",
    });

    const historyResponse = await app.inject({
      method: "GET",
      url: "/api/reports?type=history&property_id=10&from=2026-10-01&to=2026-10-10",
    });
    expect(historyResponse.statusCode).toBe(200);
    expect(historyResponse.json()).toMatchObject({
      station: null,
      property: { id: 10, name: "Fazenda Sol Nascente" },
      total_readings: 3,
    });
    expect(
      historyResponse.json().readings.map((item: { id: number }) => item.id),
    ).toEqual([2, 5, 3]);

    const alertsResponse = await app.inject({
      method: "GET",
      url: "/api/reports?type=alerts&property_id=10&from=2026-10-01&to=2026-10-10",
    });
    expect(alertsResponse.statusCode).toBe(200);
    expect(alertsResponse.json()).toMatchObject({
      property: { id: 10, name: "Fazenda Sol Nascente" },
      total_alerts: 1,
    });
    expect(alertsResponse.json().alerts[0].id).toBe(11);
  });

  it("gera relatorio forecast via GET e POST mapeando descricao do clima e horizonte de dias", async () => {
    repository.forecastDays = [
      {
        date: "2026-10-21",
        temperature_max: 29,
        temperature_min: 18,
        precipitation_mm: 0,
        precipitation_probability: 10,
        wind_speed_max_kmh: 12,
        weather_code: 0,
      },
      {
        date: "2026-10-22",
        temperature_max: 24,
        temperature_min: 17,
        precipitation_mm: 12.5,
        precipitation_probability: 80,
        wind_speed_max_kmh: 22,
        weather_code: 61,
      },
      {
        date: "2026-10-23",
        temperature_max: 26,
        temperature_min: 18,
        precipitation_mm: 3.1,
        precipitation_probability: 45,
        wind_speed_max_kmh: 18,
        weather_code: 95,
      },
      {
        date: "2026-10-24",
        temperature_max: 28,
        temperature_min: 19,
        precipitation_mm: null,
        precipitation_probability: null,
        wind_speed_max_kmh: null,
        weather_code: null,
      },
    ];

    const getForecast = await app.inject({
      method: "GET",
      url: "/api/reports?type=forecast&station_id=1&days=2",
    });
    expect(getForecast.statusCode).toBe(200);
    expect(getForecast.json()).toMatchObject({
      report_type: "forecast",
      generated_at: "2026-10-20T12:00:00.000Z",
      station: {
        id: 1,
        name: "Estacao Norte",
        latitude: -23.1896,
        longitude: -45.8841,
      },
      property: { id: 10, name: "Fazenda Sol Nascente" },
      source: "Open-Meteo",
      total_days: 2,
    });
    expect(getForecast.json().days).toEqual([
      expect.objectContaining({
        date: "2026-10-21",
        weather_code: 0,
        weather_description: "Céu limpo",
      }),
      expect.objectContaining({
        date: "2026-10-22",
        weather_code: 61,
        weather_description: "Chuva",
      }),
    ]);

    const postForecast = await app.inject({
      method: "POST",
      url: "/api/reports",
      payload: {
        type: "forecast",
        station_id: 1,
        from: "2026-10-21",
        to: "2026-10-24",
      },
    });
    expect(postForecast.statusCode).toBe(200);
    expect(postForecast.json().total_days).toBe(4);
    expect(postForecast.json().days[2].weather_description).toBe("Tempestade");
    expect(postForecast.json().days[3].weather_description).toBeNull();
  });

  it("gera relatorio alerts via GET e POST em ordem decrescente com filtro por estacao e periodo vazio", async () => {
    repository.alerts.push(
      {
        id: 14,
        station_id: 1,
        station_name: "Estacao Norte",
        sensor_id: 101,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        rule_name: "Calor critico",
        condition: "> 33",
        threshold_value: 33,
        reading_value: 35,
        triggered_at: "2026-10-09T11:00:00.000Z",
        status: "pending",
      },
      {
        id: 15,
        station_id: 2,
        station_name: "Estacao Sul",
        sensor_id: 201,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        rule_name: "Calor excessivo",
        condition: "> 30",
        threshold_value: 30,
        reading_value: 31,
        triggered_at: "2026-10-08T10:00:00.000Z",
        status: "pending",
      },
    );

    const postAlerts = await app.inject({
      method: "POST",
      url: "/api/reports",
      payload: {
        type: "alerts",
        station_id: 1,
        from: "2026-10-01",
        to: "2026-10-10",
      },
    });
    expect(postAlerts.statusCode).toBe(200);
    expect(postAlerts.json().total_alerts).toBe(2);
    expect(
      postAlerts.json().alerts.map((item: { id: number }) => item.id),
    ).toEqual([14, 11]);

    const emptyAlerts = await app.inject({
      method: "GET",
      url: "/api/reports?type=alerts&from=2026-11-01&to=2026-11-05",
    });
    expect(emptyAlerts.statusCode).toBe(200);
    expect(emptyAlerts.json()).toMatchObject({
      report_type: "alerts",
      total_alerts: 0,
      alerts: [],
    });
  });

  it("normaliza aliases localizados e retorna o catalogo completo em GET /api/reports/types", async () => {
    repository.forecastDays = [
      {
        date: "2026-10-21",
        temperature_max: 25,
        temperature_min: 16,
        precipitation_mm: 0,
        precipitation_probability: 5,
        wind_speed_max_kmh: 10,
        weather_code: 1,
      },
    ];

    const historico = await app.inject({
      method: "GET",
      url: "/api/reports?type=historico&from=2026-10-01&to=2026-10-10",
    });
    expect(historico.statusCode).toBe(200);
    expect(historico.json().report_type).toBe("history");

    const previsao = await app.inject({
      method: "POST",
      url: "/api/reports",
      payload: { type: "previsao", station_id: 1, days: 1 },
    });
    expect(previsao.statusCode).toBe(200);
    expect(previsao.json().report_type).toBe("forecast");

    const alertas = await app.inject({
      method: "GET",
      url: "/api/reports?type=alertas&from=2026-10-01&to=2026-10-10",
    });
    expect(alertas.statusCode).toBe(200);
    expect(alertas.json().report_type).toBe("alerts");

    const catalog = await app.inject({
      method: "GET",
      url: "/api/reports/types",
    });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().types).toEqual([
      expect.objectContaining({
        type: "history",
        filters: expect.objectContaining({
          default_period_days: 7,
          max_period_days: 366,
        }),
      }),
      expect.objectContaining({
        type: "forecast",
        filters: expect.objectContaining({
          required: ["station_id"],
          default_days: 7,
          max_days: 16,
        }),
      }),
      expect.objectContaining({
        type: "alerts",
        filters: expect.objectContaining({
          default_period_days: 7,
          max_period_days: 366,
        }),
      }),
    ]);
  });

  it("rejeita forecast sem coordenadas (422) quando a estacao nao possui GPS", async () => {
    repository.stations.push({
      id: 4,
      name: "Estacao Sem GPS",
      latitude: null,
      longitude: null,
      property_id: 10,
      property_name: "Fazenda Sol Nascente",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/reports?type=forecast&station_id=4",
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe("STATION_WITHOUT_COORDINATES");
  });

  it.each([
    [
      "data inicial inexistente no calendario",
      "type=history&from=2026-02-30&to=2026-10-10",
      400,
      "VALIDATION_ERROR",
    ],
    [
      "data final em formato invalido",
      "type=history&from=2026-10-01&to=ontem",
      400,
      "VALIDATION_ERROR",
    ],
    [
      "parametro desconhecido bloqueado pelo schema strict",
      "type=history&from=2026-10-01&to=2026-10-10&extra=1",
      400,
      "VALIDATION_ERROR",
    ],
    [
      "periodo invertido (from posterior a to)",
      "type=history&from=2026-10-10&to=2026-10-01",
      400,
      "INVALID_REPORT_PERIOD",
    ],
    [
      "periodo acima do limite maximo de 366 dias",
      "type=history&from=2025-01-01&to=2026-10-10",
      400,
      "INVALID_REPORT_PERIOD",
    ],
    [
      "tipo de relatorio invalido",
      "type=desconhecido&from=2026-10-01&to=2026-10-10",
      400,
      "INVALID_REPORT_TYPE",
    ],
    [
      "tipo de relatorio ausente",
      "from=2026-10-01&to=2026-10-10",
      400,
      "INVALID_REPORT_TYPE",
    ],
    [
      "forecast sem estacao informada",
      "type=forecast&days=5",
      400,
      "STATION_REQUIRED_FOR_FORECAST",
    ],
    [
      "forecast com horizonte acima de 16 dias",
      "type=forecast&station_id=1&days=17",
      400,
      "VALIDATION_ERROR",
    ],
    [
      "estacao inexistente",
      "type=history&station_id=999&from=2026-10-01&to=2026-10-10",
      404,
      "STATION_NOT_FOUND",
    ],
    [
      "propriedade inexistente",
      "type=history&property_id=999&from=2026-10-01&to=2026-10-10",
      404,
      "PROPERTY_NOT_FOUND",
    ],
  ])(
    "rejeita requisicao invalida (%s)",
    async (_label, query, expectedStatus, expectedCode) => {
      const response = await app.inject({
        method: "GET",
        url: `/api/reports?${query}`,
      });

      expect(response.statusCode).toBe(expectedStatus);
      expect(response.json().code).toBe(expectedCode);
    },
  );
});

describe("integracao de GET /api/reports com controle de acesso habilitado", () => {
  let app: FastifyInstance;
  let authRepository: FakeAuthRepository;
  let reportRepository: InMemoryReportRepository;

  beforeEach(async () => {
    authRepository = new FakeAuthRepository();
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
        name: "Usuario Sem Permissao",
        email: "sem.acesso@agritech.dev",
        active: true,
        created_at: "2026-09-01T00:00:00.000Z",
        password_hash: "unused",
        permissions: [],
        property_ids: [],
      },
    );

    reportRepository = createSeededRepository();
    app = buildApp({
      database: createUnexpectedPool(),
      jwtSecret: "scrum-561-reports-integration-test-secret",
      accessControlEnabled: true,
      authRepository,
      reportRepository,
      clock: () => FIXED_NOW,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("permite ao Gerente Agricola autenticado filtrar o relatorio por periodo", async () => {
    const token = app.jwt.sign({ sub: "1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/reports?type=history&from=2026-10-01&to=2026-10-10",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.total_readings).toBe(2);
    expect(body.readings.map((item: { id: number }) => item.id)).toEqual([
      2, 3,
    ]);
  });

  it("bloqueia requisicao anonima (401) e usuario sem monitoring.read (403) antes de consultar o repositorio", async () => {
    const getReadingsSpy = vi.spyOn(reportRepository, "getReadings");

    const anonymous = await app.inject({
      method: "GET",
      url: "/api/reports?type=history&from=2026-10-01&to=2026-10-10",
    });
    expect(anonymous.statusCode).toBe(401);

    const tokenSemPermissao = app.jwt.sign({ sub: "2" });
    const forbidden = await app.inject({
      method: "GET",
      url: "/api/reports?type=history&from=2026-10-01&to=2026-10-10",
      headers: { authorization: `Bearer ${tokenSemPermissao}` },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(getReadingsSpy).not.toHaveBeenCalled();
  });

  it("protege POST /api/reports e GET /api/reports/types com monitoring.read", async () => {
    const tokenPermitido = app.jwt.sign({ sub: "1" });
    const tokenSemPermissao = app.jwt.sign({ sub: "2" });

    const anonPost = await app.inject({
      method: "POST",
      url: "/api/reports",
      payload: { type: "history", from: "2026-10-01", to: "2026-10-10" },
    });
    expect(anonPost.statusCode).toBe(401);

    const forbiddenTypes = await app.inject({
      method: "GET",
      url: "/api/reports/types",
      headers: { authorization: `Bearer ${tokenSemPermissao}` },
    });
    expect(forbiddenTypes.statusCode).toBe(403);

    const allowedPost = await app.inject({
      method: "POST",
      url: "/api/reports",
      headers: { authorization: `Bearer ${tokenPermitido}` },
      payload: { type: "history", from: "2026-10-01", to: "2026-10-10" },
    });
    expect(allowedPost.statusCode).toBe(200);
    expect(allowedPost.json().total_readings).toBe(2);

    const allowedTypes = await app.inject({
      method: "GET",
      url: "/api/reports/types",
      headers: { authorization: `Bearer ${tokenPermitido}` },
    });
    expect(allowedTypes.statusCode).toBe(200);
    expect(allowedTypes.json().types).toHaveLength(3);
  });
});
