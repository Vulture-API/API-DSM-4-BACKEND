import { describe, expect, it } from "vitest";

import { ApplicationError } from "@/errors/application.error.js";
import { InvalidReportPeriodError } from "@/modules/reports/errors/invalid-report-period.error.js";
import { InvalidReportTypeError } from "@/modules/reports/errors/invalid-report-type.error.js";
import { ReportPropertyNotFoundError } from "@/modules/reports/errors/report-property-not-found.error.js";
import { ReportStationNotFoundError } from "@/modules/reports/errors/report-station-not-found.error.js";
import type {
  ReportAlertRow,
  ReportReadingRow,
  ReportStationInfo,
} from "@/modules/reports/repositories/report.repository.js";
import {
  filterReportAlerts,
  filterReportReadings,
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

describe("SCRUM-610: filtros puros de relatórios recebidos da dev", () => {
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
