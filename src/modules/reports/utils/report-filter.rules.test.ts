import { describe, expect, it } from "vitest";

import { ApplicationError } from "@/errors/application.error.js";
import { InvalidReportPeriodError } from "@/modules/reports/errors/invalid-report-period.error.js";
import { InvalidReportTypeError } from "@/modules/reports/errors/invalid-report-type.error.js";
import { ReportPropertyNotFoundError } from "@/modules/reports/errors/report-property-not-found.error.js";
import { ReportStationNotFoundError } from "@/modules/reports/errors/report-station-not-found.error.js";
import type {
  ReportAlertRow,
  ReportPropertyInfo,
  ReportReadingRow,
  ReportStationInfo,
} from "@/modules/reports/repositories/report.repository.js";
import {
  DEFAULT_FORECAST_DAYS,
  DEFAULT_REPORT_PERIOD_DAYS,
  filterReportAlerts,
  filterReportReadings,
  MAX_FORECAST_DAYS,
  MAX_PG_INT,
  MAX_REPORT_PERIOD_DAYS,
  normalizeOptionalScopeId,
  normalizeReportDateBoundary,
  normalizeReportFilters,
  parseReportBoundaryDate,
  resolveForecastPeriod,
  resolveReportPeriod,
  resolveReportPropertyScope,
  resolveReportStationScope,
  resolveReportType,
} from "@/modules/reports/utils/report-filter.rules.js";

const DAY_MS = 86_400_000;
const FIXED_NOW = new Date("2026-11-01T12:00:00.000Z");

const STATIONS: ReportStationInfo[] = [
  {
    id: 1,
    name: "Estação Norte",
    latitude: -23.5505,
    longitude: -46.6333,
    property_id: 10,
    property_name: "Fazenda Sol Nascente",
  },
  {
    id: 2,
    name: "Estação Sul",
    latitude: -23.56,
    longitude: -46.64,
    property_id: 10,
    property_name: "Fazenda Sol Nascente",
  },
  {
    id: 3,
    name: "Estação Leste",
    latitude: -22.9,
    longitude: -47.06,
    property_id: 20,
    property_name: "Fazenda Bela Vista",
  },
];

const PROPERTIES: ReportPropertyInfo[] = [
  { id: 10, name: "Fazenda Sol Nascente" },
  { id: 20, name: "Fazenda Bela Vista" },
];

describe("report-filter.rules", () => {
  describe("resolveReportType", () => {
    it("normaliza tipos canônicos e aliases em português", () => {
      expect(resolveReportType("history")).toBe("history");
      expect(resolveReportType("histórico")).toBe("history");
      expect(resolveReportType("LEITURAS")).toBe("history");
      expect(resolveReportType("sintetico")).toBe("history");
      expect(resolveReportType("analitico")).toBe("history");
      expect(resolveReportType("forecast")).toBe("forecast");
      expect(resolveReportType("Previsão")).toBe("forecast");
      expect(resolveReportType("tempo")).toBe("forecast");
      expect(resolveReportType("alerts")).toBe("alerts");
      expect(resolveReportType("ocorrências")).toBe("alerts");
    });

    it("rejeita tipo vazio ou desconhecido com InvalidReportTypeError", () => {
      expect(() => resolveReportType("")).toThrowError(InvalidReportTypeError);
      expect(() => resolveReportType("invalido")).toThrowError(
        InvalidReportTypeError,
      );
    });
  });

  describe("normalizeReportDateBoundary e parseReportBoundaryDate", () => {
    it("expande YYYY-MM-DD para início e fim do dia em UTC e adiciona Z quando falta fuso", () => {
      expect(normalizeReportDateBoundary("2026-10-28", "start")).toBe(
        "2026-10-28T00:00:00.000Z",
      );
      expect(normalizeReportDateBoundary("2026-10-28", "end")).toBe(
        "2026-10-28T23:59:59.999Z",
      );
      expect(normalizeReportDateBoundary("2026-10-28T10:15:00", "start")).toBe(
        "2026-10-28T10:15:00Z",
      );
      expect(
        normalizeReportDateBoundary("2026-10-28T10:15:00-03:00", "end"),
      ).toBe("2026-10-28T10:15:00-03:00");
    });

    it("faz parse válido de Date e strings válidas", () => {
      const fromDateOnly = parseReportBoundaryDate(
        "2026-10-28",
        "from",
        "start",
      );
      const toDateOnly = parseReportBoundaryDate("2026-10-28", "to", "end");
      const fromDateObj = parseReportBoundaryDate(
        new Date("2026-10-28T05:00:00.000Z"),
        "from",
        "start",
      );

      expect(fromDateOnly.toISOString()).toBe("2026-10-28T00:00:00.000Z");
      expect(toDateOnly.toISOString()).toBe("2026-10-28T23:59:59.999Z");
      expect(fromDateObj.toISOString()).toBe("2026-10-28T05:00:00.000Z");
    });

    it("rejeita calendário inexistente, espaços, formato inválido, tipo não data e Date inválida", () => {
      const invalidInputs: unknown[] = [
        "2026-02-30",
        "2026-13-01",
        "2026-04-31T12:00:00Z",
        "   ",
        "28/10/2026",
        "data-invalida",
        new Date("invalid"),
        12345,
      ];

      for (const raw of invalidInputs) {
        expect(() =>
          parseReportBoundaryDate(raw as Date | string, "from", "start"),
        ).toThrowError(InvalidReportPeriodError);
      }
    });
  });

  describe("normalizeOptionalScopeId", () => {
    it("retorna undefined quando omitido e preserva inteiros positivos válidos", () => {
      expect(normalizeOptionalScopeId(undefined, "station_id")).toBeUndefined();
      expect(normalizeOptionalScopeId(null, "station_id")).toBeUndefined();
      expect(normalizeOptionalScopeId("", "property_id")).toBeUndefined();
      expect(normalizeOptionalScopeId(1, "station_id")).toBe(1);
      expect(normalizeOptionalScopeId(MAX_PG_INT, "property_id")).toBe(
        MAX_PG_INT,
      );
    });

    it("rejeita ids não positivos, decimais, fora do limite int32 ou strings", () => {
      for (const invalid of [0, -1, 1.5, Number.NaN, MAX_PG_INT + 1, "1"]) {
        expect(() =>
          normalizeOptionalScopeId(invalid, "station_id"),
        ).toThrowError(ApplicationError);
      }
    });
  });

  describe("resolveReportPeriod", () => {
    it("aplica janela padrão de 7 dias quando entradas estão vazias", () => {
      for (const emptyInput of [
        {},
        { from: undefined, to: undefined },
        { from: null, to: null },
        { from: "", to: "" },
      ]) {
        const period = resolveReportPeriod(emptyInput, FIXED_NOW);
        expect(period.from.toISOString()).toBe(
          new Date(
            FIXED_NOW.getTime() - DEFAULT_REPORT_PERIOD_DAYS * DAY_MS,
          ).toISOString(),
        );
        expect(period.to.toISOString()).toBe(FIXED_NOW.toISOString());
        expect(period.to_unix - period.from_unix).toBe(
          DEFAULT_REPORT_PERIOD_DAYS * 86_400,
        );
      }
    });

    it("suporta apenas from ou apenas to", () => {
      const onlyFrom = resolveReportPeriod({ from: "2026-10-30" }, FIXED_NOW);
      expect(onlyFrom.from.toISOString()).toBe("2026-10-30T00:00:00.000Z");
      expect(onlyFrom.to.toISOString()).toBe(FIXED_NOW.toISOString());

      const onlyTo = resolveReportPeriod({ to: "2026-10-20" }, FIXED_NOW);
      expect(onlyTo.to.toISOString()).toBe("2026-10-20T23:59:59.999Z");
      expect(onlyTo.from.toISOString()).toBe("2026-10-13T23:59:59.999Z");
    });

    it("suporta o mesmo dia YYYY-MM-DD sem vazar o segundo inicial do dia seguinte", () => {
      const period = resolveReportPeriod(
        { from: "2026-10-28", to: "2026-10-28" },
        FIXED_NOW,
      );

      expect(period.from.toISOString()).toBe("2026-10-28T00:00:00.000Z");
      expect(period.to.toISOString()).toBe("2026-10-28T23:59:59.999Z");
      expect(period.from_unix).toBe(
        Math.floor(Date.parse("2026-10-28T00:00:00.000Z") / 1000),
      );
      expect(period.to_unix).toBe(
        Math.floor(Date.parse("2026-10-28T23:59:59.999Z") / 1000),
      );
      expect(period.to_unix).toBe(period.from_unix + 86_399);
    });

    it("aceita exatamente o limite máximo de 366 dias e respeita fusos ISO", () => {
      const to = new Date("2026-11-01T00:00:00.000Z");
      const from = new Date(to.getTime() - MAX_REPORT_PERIOD_DAYS * DAY_MS);
      const maxBoundary = resolveReportPeriod({ from, to }, FIXED_NOW);
      expect(maxBoundary.to_unix - maxBoundary.from_unix).toBe(
        MAX_REPORT_PERIOD_DAYS * 86_400,
      );

      const tzPeriod = resolveReportPeriod(
        {
          from: "2026-10-27T21:00:00-03:00",
          to: "2026-10-28T23:59:59Z",
        },
        FIXED_NOW,
      );
      expect(tzPeriod.from.toISOString()).toBe("2026-10-28T00:00:00.000Z");
      expect(tzPeriod.to.toISOString()).toBe("2026-10-28T23:59:59.000Z");
    });

    it("rejeita período invertido, igual, maior que 366 dias e datas inválidas", () => {
      expect(() =>
        resolveReportPeriod(
          { from: "2026-10-29T00:00:00Z", to: "2026-10-28T00:00:00Z" },
          FIXED_NOW,
        ),
      ).toThrowError(InvalidReportPeriodError);

      expect(() =>
        resolveReportPeriod(
          { from: "2026-10-28T10:00:00Z", to: "2026-10-28T10:00:00Z" },
          FIXED_NOW,
        ),
      ).toThrowError(InvalidReportPeriodError);

      expect(() =>
        resolveReportPeriod(
          {
            from: new Date("2025-10-30T23:59:59.000Z"),
            to: new Date("2026-11-01T00:00:00.000Z"),
          },
          FIXED_NOW,
        ),
      ).toThrowError(InvalidReportPeriodError);

      expect(() =>
        resolveReportPeriod({ from: "2026-02-30" }, FIXED_NOW),
      ).toThrowError(InvalidReportPeriodError);
    });
  });

  describe("resolveForecastPeriod", () => {
    it("resolve horizonte padrão, dias explícitos e cálculo por período válido", () => {
      const def = resolveForecastPeriod({}, FIXED_NOW);
      expect(def.days).toBe(DEFAULT_FORECAST_DAYS);
      expect(def.from.toISOString()).toBe(FIXED_NOW.toISOString());
      expect(def.to.toISOString()).toBe("2026-11-08T12:00:00.000Z");

      const explicit = resolveForecastPeriod({ days: 5 }, FIXED_NOW);
      expect(explicit.days).toBe(5);

      const ranged = resolveForecastPeriod(
        { from: "2026-11-01", to: "2026-11-03" },
        FIXED_NOW,
      );
      expect(ranged.days).toBe(3);

      const capped = resolveForecastPeriod(
        { from: "2026-11-01", to: "2026-11-30" },
        FIXED_NOW,
      );
      expect(capped.days).toBe(MAX_FORECAST_DAYS);

      const onlyTo = resolveForecastPeriod({ to: "2026-11-04" }, FIXED_NOW);
      expect(onlyTo.days).toBe(4);

      const onlyFrom = resolveForecastPeriod(
        { from: "2026-11-02", days: 4 },
        FIXED_NOW,
      );
      expect(onlyFrom.days).toBe(4);
    });

    it("rejeita days fora de 1..16 e períodos inválidos ou invertidos", () => {
      for (const badDays of [0, -1, 1.5, MAX_FORECAST_DAYS + 1, Number.NaN]) {
        expect(() =>
          resolveForecastPeriod({ days: badDays }, FIXED_NOW),
        ).toThrowError(InvalidReportPeriodError);
      }

      expect(() =>
        resolveForecastPeriod(
          { from: "2026-02-30", to: "2026-11-05" },
          FIXED_NOW,
        ),
      ).toThrowError(InvalidReportPeriodError);

      expect(() =>
        resolveForecastPeriod(
          { from: "2026-11-05T00:00:00Z", to: "2026-11-01T00:00:00Z" },
          FIXED_NOW,
        ),
      ).toThrowError(InvalidReportPeriodError);

      expect(() =>
        resolveForecastPeriod({ to: "2026-10-30" }, FIXED_NOW),
      ).toThrowError(InvalidReportPeriodError);

      expect(() =>
        resolveForecastPeriod(
          { from: "2026-11-01", to: "2028-01-01" },
          FIXED_NOW,
        ),
      ).toThrowError(InvalidReportPeriodError);
    });
  });

  describe("normalizeReportFilters", () => {
    it("não muta a entrada e suporta filtros combinados ou isolados", () => {
      const rawInput = Object.freeze({
        type: "histórico",
        station_id: 1,
        property_id: 10,
        from: "2026-10-28",
        to: "2026-10-28",
      });

      const normalized = normalizeReportFilters(rawInput, FIXED_NOW);
      expect(normalized.report_type).toBe("history");
      expect(normalized.station_id).toBe(1);
      expect(normalized.property_id).toBe(10);
      expect(normalized.period.from.toISOString()).toBe(
        "2026-10-28T00:00:00.000Z",
      );
      expect(normalized.period.to.toISOString()).toBe(
        "2026-10-28T23:59:59.999Z",
      );
      expect(normalized.forecast_period).toBeUndefined();

      const forecastOnly = normalizeReportFilters(
        { type: "previsao", station_id: 1, days: 3 },
        FIXED_NOW,
      );
      expect(forecastOnly.report_type).toBe("forecast");
      expect(forecastOnly.forecast_period?.days).toBe(3);
    });
  });

  describe("resolveReportStationScope e resolveReportPropertyScope", () => {
    it("retorna entidade existente e lança erro 404 para inexistente ou lista vazia", () => {
      expect(resolveReportStationScope(1, STATIONS).name).toBe("Estação Norte");
      expect(() => resolveReportStationScope(999, STATIONS)).toThrowError(
        ReportStationNotFoundError,
      );
      expect(() => resolveReportStationScope(1, [])).toThrowError(
        ReportStationNotFoundError,
      );

      expect(resolveReportPropertyScope(20, PROPERTIES).name).toBe(
        "Fazenda Bela Vista",
      );
      expect(() => resolveReportPropertyScope(999, PROPERTIES)).toThrowError(
        ReportPropertyNotFoundError,
      );
      expect(() => resolveReportPropertyScope(10, [])).toThrowError(
        ReportPropertyNotFoundError,
      );
    });
  });

  describe("filterReportReadings", () => {
    const t0 = Math.floor(Date.parse("2026-10-28T00:00:00.000Z") / 1000);
    const tMid = Math.floor(Date.parse("2026-10-28T12:00:00.000Z") / 1000);
    const tEnd = Math.floor(Date.parse("2026-10-28T23:59:59.000Z") / 1000);
    const tNext = Math.floor(Date.parse("2026-10-29T00:00:00.000Z") / 1000);

    const readings: ReportReadingRow[] = [
      {
        id: 1,
        station_id: 1,
        sensor_id: 10,
        sensor_type_id: 1,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        value: 20,
        unix_time: t0 - 1,
        data_consistent: true,
      },
      {
        id: 2,
        station_id: 1,
        sensor_id: 10,
        sensor_type_id: 1,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        value: 22,
        unix_time: t0,
        data_consistent: true,
      },
      {
        id: 3,
        station_id: 2,
        sensor_id: 20,
        sensor_type_id: 1,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        value: 25,
        unix_time: tMid,
        data_consistent: true,
      },
      {
        id: 4,
        station_id: 3,
        sensor_id: 30,
        sensor_type_id: 1,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        value: 27,
        unix_time: tEnd,
        data_consistent: true,
      },
      {
        id: 5,
        station_id: 1,
        sensor_id: 10,
        sensor_type_id: 1,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        value: 19,
        unix_time: tNext,
        data_consistent: true,
      },
    ];

    it("filtra apenas por período respeitando fronteiras inclusivas", () => {
      const result = filterReportReadings(
        readings,
        { from_unix: t0, to_unix: tEnd },
        STATIONS,
      );
      expect(result.map((r) => r.id)).toEqual([2, 3, 4]);
    });

    it("filtra apenas por estação mantendo o período amplo", () => {
      const result = filterReportReadings(
        readings,
        { from_unix: 0, to_unix: tNext + 1000, station_id: 1 },
        STATIONS,
      );
      expect(result.map((r) => r.id)).toEqual([1, 2, 5]);
    });

    it("filtra por período e estação simultaneamente e também por propriedade", () => {
      const byPeriodAndStation = filterReportReadings(
        readings,
        { from_unix: t0, to_unix: tEnd, station_id: 1 },
        STATIONS,
      );
      expect(byPeriodAndStation.map((r) => r.id)).toEqual([2]);

      const byPeriodAndProperty = filterReportReadings(
        readings,
        { from_unix: t0, to_unix: tEnd, property_id: 10 },
        STATIONS,
      );
      expect(byPeriodAndProperty.map((r) => r.id)).toEqual([2, 3]);

      const mismatchedScope = filterReportReadings(
        readings,
        { from_unix: t0, to_unix: tEnd, station_id: 1, property_id: 20 },
        STATIONS,
      );
      expect(mismatchedScope).toEqual([]);
    });

    it("trata entradas e resultados vazios e preserva leituras legadas sem station_id", () => {
      expect(
        filterReportReadings([], { from_unix: t0, to_unix: tEnd }, STATIONS),
      ).toEqual([]);

      expect(
        filterReportReadings(
          readings,
          { from_unix: t0, to_unix: tEnd, station_id: 999 },
          STATIONS,
        ),
      ).toEqual([]);

      const legacyReading: ReportReadingRow = {
        id: 99,
        sensor_id: 10,
        sensor_type_id: 1,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        value: 21,
        unix_time: tMid,
        data_consistent: true,
      };
      expect(
        filterReportReadings(
          [legacyReading],
          { from_unix: t0, to_unix: tEnd, station_id: 1 },
          STATIONS,
        ).map((r) => r.id),
      ).toEqual([99]);
    });
  });

  describe("filterReportAlerts", () => {
    const alerts: ReportAlertRow[] = [
      {
        id: 1,
        station_id: 1,
        station_name: "Estação Norte",
        sensor_id: 10,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        rule_name: "Alta",
        condition: "> 30",
        threshold_value: 30,
        reading_value: 31,
        triggered_at: "2026-10-27T23:59:59.999Z",
        status: "pending",
      },
      {
        id: 2,
        station_id: 1,
        station_name: "Estação Norte",
        sensor_id: 10,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        rule_name: "Alta",
        condition: "> 30",
        threshold_value: 30,
        reading_value: 32,
        triggered_at: "2026-10-28T00:00:00.000Z",
        status: "pending",
      },
      {
        id: 3,
        station_id: 3,
        station_name: "Estação Leste",
        sensor_id: 30,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        rule_name: "Alta",
        condition: "> 30",
        threshold_value: 30,
        reading_value: 33,
        triggered_at: "2026-10-28T23:59:59.999Z",
        status: "acknowledged",
      },
      {
        id: 4,
        station_id: 1,
        station_name: "Estação Norte",
        sensor_id: 10,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        rule_name: "Alta",
        condition: "> 30",
        threshold_value: 30,
        reading_value: 34,
        triggered_at: "data-invalida",
        status: "pending",
      },
    ];

    const fromDate = new Date("2026-10-28T00:00:00.000Z");
    const toDate = new Date("2026-10-28T23:59:59.999Z");

    it("filtra alertas por período, estação, propriedade e combinações", () => {
      expect(
        filterReportAlerts(
          alerts,
          { from_date: fromDate, to_date: toDate },
          STATIONS,
        ).map((a) => a.id),
      ).toEqual([2, 3]);

      expect(
        filterReportAlerts(
          alerts,
          {
            from_date: new Date("2026-10-01T00:00:00.000Z"),
            to_date: toDate,
            station_id: 1,
          },
          STATIONS,
        ).map((a) => a.id),
      ).toEqual([1, 2]);

      expect(
        filterReportAlerts(
          alerts,
          { from_date: fromDate, to_date: toDate, station_id: 1 },
          STATIONS,
        ).map((a) => a.id),
      ).toEqual([2]);

      expect(
        filterReportAlerts(
          alerts,
          { from_date: fromDate, to_date: toDate, property_id: 20 },
          STATIONS,
        ).map((a) => a.id),
      ).toEqual([3]);

      expect(
        filterReportAlerts(
          alerts,
          {
            from_date: fromDate,
            to_date: toDate,
            station_id: 1,
            property_id: 20,
          },
          STATIONS,
        ),
      ).toEqual([]);

      expect(
        filterReportAlerts([], { from_date: fromDate, to_date: toDate }),
      ).toEqual([]);
    });
  });
});

describe("SCRUM-610: filtros puros de relatórios recebidos da dev", () => {
  const now = new Date("2026-11-01T12:00:00.000Z");
  const stations: ReportStationInfo[] = [
    {
      id: 1,
      property_id: 10,
      name: "Norte",
      property_name: "A",
      latitude: null,
      longitude: null,
    },
    {
      id: 2,
      property_id: 20,
      name: "Sul",
      property_name: "B",
      latitude: null,
      longitude: null,
    },
  ];
  const reading = (
    id: number,
    stationId: number,
    time: number,
  ): ReportReadingRow => ({
    id,
    station_id: stationId,
    sensor_id: 1,
    sensor_type_id: 1,
    sensor_type: "Temperatura",
    unit_of_measure: "C",
    value: 20,
    unix_time: time,
    data_consistent: true,
  });
  const alert = (
    id: number,
    stationId: number,
    time: string,
  ): ReportAlertRow => ({
    id,
    station_id: stationId,
    station_name: "Estação",
    sensor_id: 1,
    sensor_type: "Temperatura",
    unit_of_measure: "C",
    rule_name: "Limite",
    condition: "gt",
    threshold_value: 30,
    reading_value: 31,
    triggered_at: time,
    status: "pending",
  });

  it.each([
    [" HISTÓRICO ", "history"],
    ["leituras", "history"],
    ["sintético", "history"],
    ["analítico", "history"],
    ["Previsões", "forecast"],
    ["tempo", "forecast"],
    ["ocorrências", "alerts"],
    ["alertas", "alerts"],
  ])("normaliza o alias %s para %s", (input, expected) => {
    expect(resolveReportType(input)).toBe(expected);
  });

  it.each(["", "inexistente", "   "])("rejeita o tipo inválido %j", (type) => {
    expect(() => resolveReportType(type)).toThrow(InvalidReportTypeError);
  });

  it("expande datas sem horário para os extremos do dia em UTC", () => {
    expect(normalizeReportDateBoundary("2026-11-01", "start")).toBe(
      "2026-11-01T00:00:00.000Z",
    );
    expect(normalizeReportDateBoundary("2026-11-01", "end")).toBe(
      "2026-11-01T23:59:59.999Z",
    );
    expect(normalizeReportDateBoundary("2026-11-01T10:00:00", "start")).toBe(
      "2026-11-01T10:00:00Z",
    );
    expect(
      parseReportBoundaryDate(
        "2026-11-01T10:00:00-03:00",
        "from",
        "start",
      ).toISOString(),
    ).toBe("2026-11-01T13:00:00.000Z");
  });

  it("clona objetos Date sem alterar o valor recebido", () => {
    const parsed = parseReportBoundaryDate(now, "from", "start");
    expect(parsed).toEqual(now);
    expect(parsed).not.toBe(now);
  });

  it.each([
    "2026-02-29",
    "2026-13-01",
    "não é data",
    "",
    new Date(Number.NaN),
    123,
  ])("rejeita limite de período inválido %j", (input) => {
    expect(() =>
      parseReportBoundaryDate(input as string, "from", "start"),
    ).toThrow(InvalidReportPeriodError);
  });

  it.each([undefined, null, ""])("aceita identificador omitido %j", (value) => {
    expect(normalizeOptionalScopeId(value, "property_id")).toBeUndefined();
  });

  it.each([1, 2_147_483_647])(
    "aceita identificador no intervalo PostgreSQL: %s",
    (value) => {
      expect(normalizeOptionalScopeId(value, "station_id")).toBe(value);
    },
  );

  it.each([
    0,
    -1,
    1.5,
    2_147_483_648,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "1",
    false,
  ])("rejeita identificador inválido %j antes de consultar dados", (value) => {
    expect(() => normalizeOptionalScopeId(value, "property_id")).toThrow(
      ApplicationError,
    );
  });

  it("resolve os sete dias anteriores usando o relógio recebido", () => {
    const result = resolveReportPeriod({}, now);
    expect(result.from.toISOString()).toBe("2026-10-25T12:00:00.000Z");
    expect(result.to).toEqual(now);
    expect(result.to).not.toBe(now);
    expect(result.from_unix).toBe(Date.parse("2026-10-25T12:00:00Z") / 1000);
  });

  it("preserva os dois extremos inclusivos de um dia", () => {
    const result = resolveReportPeriod(
      { from: "2026-11-01", to: "2026-11-01" },
      now,
    );
    expect(result.from_unix).toBe(Date.parse("2026-11-01T00:00:00Z") / 1000);
    expect(result.to_unix).toBe(Date.parse("2026-11-01T23:59:59Z") / 1000);
  });

  it.each([
    { from: "2026-11-02", to: "2026-11-01" },
    { from: "2025-01-01", to: "2026-11-01" },
  ])("rejeita período invertido ou maior que 366 dias: %j", (input) => {
    expect(() => resolveReportPeriod(input, now)).toThrow(
      InvalidReportPeriodError,
    );
  });

  it("aceita exatamente 366 dias, sem arredondar para fora do limite", () => {
    const from = new Date("2024-01-01T00:00:00Z");
    const to = new Date("2025-01-01T00:00:00Z");
    expect(resolveReportPeriod({ from, to }, now)).toMatchObject({ from, to });
  });

  it("resolve previsão padrão e limita o horizonte por período a 16 dias", () => {
    expect(resolveForecastPeriod({}, now)).toEqual({
      days: 7,
      from: now,
      to: new Date("2026-11-08T12:00:00Z"),
    });
    expect(
      resolveForecastPeriod({ from: "2026-11-01", to: "2026-12-01" }, now).days,
    ).toBe(16);
    expect(resolveForecastPeriod({ to: "2026-11-02" }, now).days).toBe(2);
  });

  it.each([0, 17, 1.5, Number.NaN])(
    "rejeita horizonte inválido: %s",
    (days) => {
      expect(() => resolveForecastPeriod({ days }, now)).toThrow(
        InvalidReportPeriodError,
      );
    },
  );

  it.each([
    { from: "2026-11-03", to: "2026-11-01" },
    { to: "2026-10-31" },
    { to: "2028-01-01" },
    { from: "2024-01-01", to: "2026-11-01" },
  ])("rejeita limites inválidos da previsão: %j", (input) => {
    expect(() => resolveForecastPeriod(input, now)).toThrow(
      InvalidReportPeriodError,
    );
  });

  it("normaliza filtros de previsão e histórico preservando os IDs solicitados", () => {
    const forecast = normalizeReportFilters(
      { type: "previsão", station_id: 1, property_id: 10, days: 2 },
      now,
    );
    expect(forecast).toMatchObject({
      report_type: "forecast",
      station_id: 1,
      property_id: 10,
      forecast_period: { days: 2 },
    });
    expect(forecast.period.to_unix - forecast.period.from_unix).toBe(
      2 * 86_400,
    );
    const history = normalizeReportFilters(
      { type: "dados", from: "2026-10-01", to: "2026-10-02" },
      now,
    );
    expect(history.report_type).toBe("history");
    expect(history.forecast_period).toBeUndefined();
  });

  it("resolve somente estações e propriedades presentes na coleção recebida", () => {
    expect(resolveReportStationScope(2, stations)).toBe(stations[1]);
    expect(() => resolveReportStationScope(99, stations)).toThrow(
      ReportStationNotFoundError,
    );
    const properties = [{ id: 10, name: "A" }];
    expect(resolveReportPropertyScope(10, properties)).toBe(properties[0]);
    expect(() => resolveReportPropertyScope(20, properties)).toThrow(
      ReportPropertyNotFoundError,
    );
  });

  it("combina propriedade, estação e período inclusivo sem alterar as leituras", () => {
    const rows = [
      reading(1, 1, 99),
      reading(2, 1, 100),
      reading(3, 1, 200),
      reading(4, 1, 201),
      reading(5, 2, 150),
    ];
    const snapshot = structuredClone(rows);
    expect(
      filterReportReadings(
        rows,
        { property_id: 10, station_id: 1, from_unix: 100, to_unix: 200 },
        stations,
      ).map((r) => r.id),
    ).toEqual([2, 3]);
    expect(rows).toEqual(snapshot);
    expect(
      filterReportReadings(
        rows,
        { property_id: 99, from_unix: 100, to_unix: 200 },
        stations,
      ),
    ).toEqual([]);
    expect(
      filterReportReadings(
        rows,
        { property_id: 10, station_id: 2, from_unix: 100, to_unix: 200 },
        stations,
      ),
    ).toEqual([]);
  });

  it("permite consulta global sem coleção de estações", () => {
    const rows = [reading(1, 1, 100), reading(2, 2, 150)];
    expect(
      filterReportReadings(rows, { from_unix: 100, to_unix: 200 }),
    ).toEqual(rows);
  });

  it("exclui alertas inválidos ou externos e preserva os extremos inclusivos", () => {
    const rows = [
      alert(1, 1, "2026-11-01T00:00:00Z"),
      alert(2, 1, "2026-11-02T00:00:00Z"),
      alert(3, 1, "2026-11-02T00:00:01Z"),
      alert(4, 2, "2026-11-01T12:00:00Z"),
      alert(5, 1, "data inválida"),
    ];
    const snapshot = structuredClone(rows);
    const filters = {
      property_id: 10,
      station_id: 1,
      from_date: new Date("2026-11-01T00:00:00Z"),
      to_date: new Date("2026-11-02T00:00:00Z"),
    };
    expect(
      filterReportAlerts(rows, filters, stations).map((r) => r.id),
    ).toEqual([1, 2]);
    expect(rows).toEqual(snapshot);
    expect(
      filterReportAlerts(rows, { ...filters, property_id: 99 }, stations),
    ).toEqual([]);
    expect(
      filterReportAlerts(
        rows,
        { ...filters, property_id: undefined, station_id: 2 },
        stations,
      ).map((r) => r.id),
    ).toEqual([4]);
  });
});
