import { describe, expect, it } from "vitest";

import type { ApplicationError } from "@/errors/application.error.js";
import { EmptyReportExportError } from "@/modules/reports/errors/empty-report-export.error.js";
import { InvalidExportFormatError } from "@/modules/reports/errors/invalid-export-format.error.js";
import { InvalidExportReportPayloadError } from "@/modules/reports/errors/invalid-export-report-payload.error.js";
import { InMemoryReportRepository } from "@/modules/reports/repositories/report.repository.js";
import { ExportReportService } from "@/modules/reports/services/export-report.service.js";
import { GenerateReportService } from "@/modules/reports/services/generate-report.service.js";
import type {
  AlertsReport,
  ForecastReport,
  HistoryReport,
  MeteorologicalReport,
} from "@/modules/reports/types/report.type.js";
import {
  buildExportFilename,
  escapeCsvCell,
  exportReport,
  extractReportFilters,
  formatPreparedReportAsCsv,
  formatPreparedReportAsJson,
  prepareReportForExport,
  resolveExportFormat,
  validateReportForExport,
} from "@/modules/reports/utils/report-export.rules.js";

const FIXED_GENERATED_AT = "2026-11-11T12:00:00.000Z";
const FIXED_PERIOD = {
  from: "2026-10-25T00:00:00.000Z",
  to: "2026-11-01T23:59:59.000Z",
};

function captureError<T extends ApplicationError>(
  action: () => unknown,
  ErrorClass: new (...args: never[]) => T,
): T {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }

  expect(caught, `Era esperado lançar ${ErrorClass.name}`).toBeInstanceOf(
    ErrorClass,
  );

  return caught as T;
}

function makeHistoryReport(
  overrides: Partial<HistoryReport> = {},
): HistoryReport {
  return {
    report_type: "history",
    generated_at: FIXED_GENERATED_AT,
    period: { ...FIXED_PERIOD },
    station: {
      id: 1,
      name: "Estação Norte",
    },
    property: {
      id: 10,
      name: "Fazenda Boa Vista",
    },
    total_readings: 2,
    summary: [
      {
        sensor_type_id: 1,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        count: 2,
        avg: 24.5,
        min: 21,
        max: 28,
        stddev: 3.5,
        accumulated: null,
      },
    ],
    readings: [
      {
        id: 20,
        sensor_id: 101,
        sensor_type_id: 1,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        value: 28,
        unix_time: 1761958800,
        date_time: "2026-11-01T01:00:00.000Z",
        data_consistent: false,
      },
      {
        id: 10,
        sensor_id: 101,
        sensor_type_id: 1,
        sensor_type: "Temperatura",
        unit_of_measure: "°C",
        value: 21,
        unix_time: 1761955200,
        date_time: "2026-11-01T00:00:00.000Z",
        data_consistent: true,
      },
    ],
    ...overrides,
  };
}

function makeForecastReport(
  overrides: Partial<ForecastReport> = {},
): ForecastReport {
  return {
    report_type: "forecast",
    generated_at: FIXED_GENERATED_AT,
    period: {
      from: "2026-11-11T12:00:00.000Z",
      to: "2026-11-13T12:00:00.000Z",
    },
    station: {
      id: 1,
      name: "Estação Norte",
      latitude: -23.19,
      longitude: -45.88,
    },
    property: {
      id: 10,
      name: "Fazenda Boa Vista",
    },
    source: "open-meteo",
    total_days: 2,
    days: [
      {
        date: "2026-11-12",
        temperature_max: 24.8,
        temperature_min: 17,
        precipitation_mm: 12.4,
        precipitation_probability: 80,
        wind_speed_max_kmh: null,
        weather_code: 63,
        weather_description: "Chuva",
      },
      {
        date: "2026-11-11",
        temperature_max: 29.4,
        temperature_min: 18.1,
        precipitation_mm: 0,
        precipitation_probability: 10,
        wind_speed_max_kmh: 14.5,
        weather_code: 1,
        weather_description: "Predominantemente limpo",
      },
    ],
    ...overrides,
  };
}

function makeAlertsReport(overrides: Partial<AlertsReport> = {}): AlertsReport {
  return {
    report_type: "alerts",
    generated_at: FIXED_GENERATED_AT,
    period: { ...FIXED_PERIOD },
    station: null,
    property: {
      id: 10,
      name: "Fazenda Boa Vista",
    },
    total_alerts: 2,
    alerts: [
      {
        id: 39,
        station_id: 1,
        station_name: "Estação Norte",
        sensor_id: 6,
        sensor_type: "Pluviômetro",
        rule_name: "Chuva Intensa",
        condition: ">= 30",
        threshold_value: 30,
        reading_value: 35.2,
        unit_of_measure: "mm",
        triggered_at: "2026-10-30T18:15:00.000Z",
        status: "acknowledged",
      },
      {
        id: 42,
        station_id: 2,
        station_name: "Estação Sul",
        sensor_id: 8,
        sensor_type: "Temperatura",
        rule_name: "Geada Crítica",
        condition: "< 2",
        threshold_value: 2,
        reading_value: 0.8,
        unit_of_measure: "°C",
        triggered_at: "2026-10-31T05:30:00.000Z",
        status: "pending",
      },
    ],
    ...overrides,
  };
}

describe("Regras de Exportação de Relatórios (report-export.rules)", () => {
  describe("1. Resolução e validação do formato de exportação (resolveExportFormat)", () => {
    it.each([
      ["csv", "csv"],
      ["CSV", "csv"],
      [" .csv ", "csv"],
      ["text/csv", "csv"],
      ["TEXT/CSV", "csv"],
      ["json", "json"],
      ["JSON", "json"],
      [".json", "json"],
      [" application/json ", "json"],
    ] as const)(
      "normaliza o formato '%s' para '%s'",
      (rawFormat, expectedFormat) => {
        expect(
          resolveExportFormat(rawFormat),
          `Formato '${rawFormat}' deve resolver para '${expectedFormat}'`,
        ).toBe(expectedFormat);
      },
    );

    it.each([[null], [undefined], [123], [{}], [["csv"]]])(
      "rejeita formato não textual (%j) com InvalidExportFormatError",
      (invalidInput) => {
        const appError = captureError(
          () => resolveExportFormat(invalidInput),
          InvalidExportFormatError,
        );

        expect(appError.statusCode, "Status HTTP deve ser 400").toBe(400);
        expect(
          appError.code,
          "Código de erro deve ser INVALID_EXPORT_FORMAT",
        ).toBe("INVALID_EXPORT_FORMAT");
        expect(
          appError.message,
          "Mensagem deve informar ausência de formato válido",
        ).toContain("Nenhum formato de exportação foi informado.");
      },
    );

    it.each(["", "   ", "pdf", "xlsx", "xml", "text/plain"])(
      "rejeita formato não suportado ('%s') informando os formatos permitidos",
      (unsupportedFormat) => {
        const appError = captureError(
          () => resolveExportFormat(unsupportedFormat),
          InvalidExportFormatError,
        );

        expect(appError.statusCode, "Status HTTP deve ser 400").toBe(400);
        expect(
          appError.code,
          "Código de erro deve ser INVALID_EXPORT_FORMAT",
        ).toBe("INVALID_EXPORT_FORMAT");
        expect(
          appError.message,
          "Mensagem deve listar os formatos permitidos ('csv' e 'json')",
        ).toContain("Os formatos permitidos são: 'csv' e 'json'.");
      },
    );
  });

  describe("2. Validação estrutural do payload de relatório (validateReportForExport)", () => {
    it.each([[null], [undefined], ["history"], [42], [[1, 2]]])(
      "rejeita payload que não é objeto plano (%j)",
      (invalidPayload) => {
        const appError = captureError(
          () => validateReportForExport(invalidPayload),
          InvalidExportReportPayloadError,
        );

        expect(appError.statusCode, "Status HTTP deve ser 400").toBe(400);
        expect(
          appError.code,
          "Código de erro deve ser INVALID_EXPORT_REPORT",
        ).toBe("INVALID_EXPORT_REPORT");
        expect(
          appError.message,
          "Mensagem deve exigir um objeto de relatório válido",
        ).toContain("é obrigatório fornecer um objeto de relatório válido.");
      },
    );

    it("rejeita report_type inválido ou ausente", () => {
      const invalidReport = {
        ...makeHistoryReport(),
        report_type: "summary",
      };

      const appError = captureError(
        () => validateReportForExport(invalidReport),
        InvalidExportReportPayloadError,
      );

      expect(appError.statusCode, "Status HTTP deve ser 400").toBe(400);
      expect(
        appError.code,
        "Código de erro deve ser INVALID_EXPORT_REPORT",
      ).toBe("INVALID_EXPORT_REPORT");
      expect(
        appError.message,
        "Mensagem deve indicar os tipos canônicos aceitos em report_type",
      ).toContain(
        "o campo 'report_type' deve ser 'history', 'forecast' ou 'alerts'.",
      );
    });

    it.each(["", "   ", "data-invalida", null, 123])(
      "rejeita generated_at inválido (%j)",
      (invalidGeneratedAt) => {
        const invalidReport = {
          ...makeHistoryReport(),
          generated_at: invalidGeneratedAt,
        };

        const appError = captureError(
          () => validateReportForExport(invalidReport),
          InvalidExportReportPayloadError,
        );

        expect(appError.statusCode, "Status HTTP deve ser 400").toBe(400);
        expect(
          appError.message,
          "Mensagem deve exigir generated_at válido",
        ).toContain("o campo 'generated_at' deve ser uma data válida.");
      },
    );

    it.each([[null], [undefined], ["2026-10-25"], [["2026-10-25"]]])(
      "rejeita period ausente ou não estruturado (%j)",
      (invalidPeriod) => {
        const invalidReport = {
          ...makeHistoryReport(),
          period: invalidPeriod,
        };

        const appError = captureError(
          () => validateReportForExport(invalidReport),
          InvalidExportReportPayloadError,
        );

        expect(appError.statusCode, "Status HTTP deve ser 400").toBe(400);
        expect(
          appError.message,
          "Mensagem deve indicar que 'period' exige 'from' e 'to'",
        ).toContain(
          "o campo 'period' é obrigatório e deve conter 'from' e 'to'.",
        );
      },
    );

    it.each([
      { from: "", to: "2026-11-01T00:00:00.000Z" },
      { from: "2026-10-25T00:00:00.000Z", to: "invalida" },
      { from: null, to: "2026-11-01T00:00:00.000Z" },
    ])(
      "rejeita period com datas from/to inválidas (%j)",
      (invalidPeriodDates) => {
        const invalidReport = {
          ...makeHistoryReport(),
          period: invalidPeriodDates,
        };

        const appError = captureError(
          () => validateReportForExport(invalidReport),
          InvalidExportReportPayloadError,
        );

        expect(appError.statusCode, "Status HTTP deve ser 400").toBe(400);
        expect(
          appError.message,
          "Mensagem deve exigir datas válidas em period.from e period.to",
        ).toContain(
          "as datas 'period.from' e 'period.to' devem ser datas válidas.",
        );
      },
    );

    it("rejeita período invertido onde period.from é posterior a period.to", () => {
      const invalidReport = makeHistoryReport({
        period: {
          from: "2026-11-02T00:00:00.000Z",
          to: "2026-11-01T00:00:00.000Z",
        },
      });

      const appError = captureError(
        () => validateReportForExport(invalidReport),
        InvalidExportReportPayloadError,
      );

      expect(appError.statusCode, "Status HTTP deve ser 400").toBe(400);
      expect(
        appError.message,
        "Mensagem deve acusar período invertido",
      ).toContain(
        "a data inicial 'period.from' não pode ser posterior a 'period.to'.",
      );
    });

    it("aceita caso limite onde period.from é exatamente igual a period.to", () => {
      const sameInstant = "2026-11-01T00:00:00.000Z";
      const report = makeHistoryReport({
        period: { from: sameInstant, to: sameInstant },
      });

      const validated = validateReportForExport(report);
      expect(
        validated.period,
        "Período com limites iguais deve ser aceito sem erro",
      ).toEqual({
        from: sameInstant,
        to: sameInstant,
      });
    });

    it("rejeita relatório history sem array válido em readings", () => {
      const invalidHistory = {
        ...makeHistoryReport(),
        readings: null,
      };

      const appError = captureError(
        () => validateReportForExport(invalidHistory),
        InvalidExportReportPayloadError,
      );

      expect(appError.statusCode, "Status HTTP deve ser 400").toBe(400);
      expect(
        appError.message,
        "Mensagem deve exigir lista válida em 'readings'",
      ).toContain(
        "o relatório histórico deve conter uma lista válida em 'readings'.",
      );
    });

    it.each([null, { id: "1", name: "Estação Norte" }, { id: 1, name: null }])(
      "rejeita relatório forecast com station ausente ou malformado (%j)",
      (invalidStation) => {
        const invalidForecast = {
          ...makeForecastReport(),
          station: invalidStation,
        };

        const appError = captureError(
          () => validateReportForExport(invalidForecast),
          InvalidExportReportPayloadError,
        );

        expect(appError.statusCode, "Status HTTP deve ser 400").toBe(400);
        expect(
          appError.message,
          "Mensagem deve exigir metadados válidos da estação (id e name)",
        ).toContain(
          "o relatório de previsões deve conter os metadados válidos da estação em 'station' (id e name).",
        );
      },
    );

    it("rejeita relatório forecast sem array válido em days", () => {
      const invalidForecast = {
        ...makeForecastReport(),
        days: "invalido",
      };

      const appError = captureError(
        () => validateReportForExport(invalidForecast),
        InvalidExportReportPayloadError,
      );

      expect(appError.statusCode, "Status HTTP deve ser 400").toBe(400);
      expect(
        appError.message,
        "Mensagem deve exigir lista válida em 'days'",
      ).toContain(
        "o relatório de previsões deve conter uma lista válida em 'days'.",
      );
    });

    it("rejeita relatório alerts sem array válido em alerts", () => {
      const invalidAlerts = {
        ...makeAlertsReport(),
        alerts: {},
      };

      const appError = captureError(
        () => validateReportForExport(invalidAlerts),
        InvalidExportReportPayloadError,
      );

      expect(appError.statusCode, "Status HTTP deve ser 400").toBe(400);
      expect(
        appError.message,
        "Mensagem deve exigir lista válida em 'alerts'",
      ).toContain(
        "o relatório de alertas deve conter uma lista válida em 'alerts'.",
      );
    });
  });

  describe("3. Preservação e imutabilidade dos filtros aplicados (extractReportFilters)", () => {
    it("preserva report_type, period, station e property sem compartilhar referências mutáveis", () => {
      const report = makeForecastReport();
      const filters = extractReportFilters(report);

      expect(
        filters,
        "Filtros extraídos devem conter coordenadas da estação e metadados da propriedade",
      ).toEqual({
        report_type: "forecast",
        period: {
          from: "2026-11-11T12:00:00.000Z",
          to: "2026-11-13T12:00:00.000Z",
        },
        station: {
          id: 1,
          name: "Estação Norte",
          latitude: -23.19,
          longitude: -45.88,
        },
        property: {
          id: 10,
          name: "Fazenda Boa Vista",
        },
      });

      filters.period.from = "1999-01-01T00:00:00.000Z";
      if (filters.station) {
        filters.station.name = "Estação Alterada";
      }
      if (filters.property) {
        filters.property.name = "Propriedade Alterada";
      }

      expect(
        report.period.from,
        "Mutação no filtro extraído não deve alterar period.from original",
      ).toBe("2026-11-11T12:00:00.000Z");
      expect(
        report.station.name,
        "Mutação no filtro extraído não deve alterar station.name original",
      ).toBe("Estação Norte");
      expect(
        report.property?.name,
        "Mutação no filtro extraído não deve alterar property.name original",
      ).toBe("Fazenda Boa Vista");
    });

    it("preserva station e property como null quando o relatório tem escopo geral", () => {
      const report = makeHistoryReport({
        station: null,
        property: null,
      });

      const filters = extractReportFilters(report);

      expect(
        filters.station,
        "Estação deve ser null no filtro geral",
      ).toBeNull();
      expect(
        filters.property,
        "Propriedade deve ser null no filtro geral",
      ).toBeNull();
    });
  });

  describe("4. Preparação e ordenação dos dados para exportação (prepareReportForExport)", () => {
    it("prepara relatório history ordenando por unix_time e id crescente e formatando consistência", () => {
      const report = makeHistoryReport({
        readings: [
          {
            id: 30,
            sensor_id: 101,
            sensor_type_id: 1,
            sensor_type: "Temperatura",
            unit_of_measure: "°C",
            value: 25.5,
            unix_time: 1761958800,
            date_time: "2026-11-01T01:00:00.000Z",
            data_consistent: false,
          },
          {
            id: 15,
            sensor_id: 102,
            sensor_type_id: 2,
            sensor_type: "Umidade",
            unit_of_measure: "%",
            value: 70,
            unix_time: 1761955200,
            date_time: "2026-11-01T00:00:00.000Z",
            data_consistent: true,
          },
          {
            id: 10,
            sensor_id: 101,
            sensor_type_id: 1,
            sensor_type: "Temperatura",
            unit_of_measure: "°C",
            value: 21,
            unix_time: 1761955200,
            date_time: "2026-11-01T00:00:00.000Z",
            data_consistent: true,
          },
        ],
      });

      const prepared = prepareReportForExport(report);

      expect(prepared.reportType, "Tipo preparado deve ser 'history'").toBe(
        "history",
      );
      expect(prepared.totalRecords, "Total de registros deve ser 3").toBe(3);
      expect(
        prepared.isEmpty,
        "Indicador isEmpty deve ser false com leituras presentes",
      ).toBe(false);
      expect(
        prepared.rows.map((r) => r["ID Leitura"]),
        "Leituras devem ser ordenadas por unix_time crescente e desempate por ID crescente",
      ).toEqual([10, 15, 30]);

      expect(
        prepared.rows[0],
        "Linha preparada de leitura consistente deve conter colunas padronizadas",
      ).toEqual({
        "ID Leitura": 10,
        Estação: "Estação Norte",
        Propriedade: "Fazenda Boa Vista",
        "Sensor ID": 101,
        Parâmetro: "Temperatura",
        Valor: 21,
        Unidade: "°C",
        "Data/Hora ISO": "2026-11-01T00:00:00.000Z",
        Consistente: "Sim",
      });
      expect(
        prepared.rows[2]?.Consistente,
        "Leitura inconsistente deve ser traduzida para 'Não'",
      ).toBe("Não");
    });

    it("usa fallback 'Todas' em history quando station e property são nulos e trata summary ausente", () => {
      const rawHistory = {
        ...makeHistoryReport({
          station: null,
          property: null,
        }),
        summary: undefined,
      } as unknown as MeteorologicalReport;

      const prepared = prepareReportForExport(rawHistory);

      expect(
        prepared.rows[0]?.["Estação"],
        "Coluna Estação deve usar fallback 'Todas' quando station é null",
      ).toBe("Todas");
      expect(
        prepared.rows[0]?.["Propriedade"],
        "Coluna Propriedade deve usar fallback 'Todas' quando property é null",
      ).toBe("Todas");
      expect(
        prepared.summary,
        "Resumo ausente em history deve ser normalizado para lista vazia",
      ).toEqual([]);
    });

    it("prepara relatório forecast ordenando dias cronologicamente e preservando valores nulos", () => {
      const report = makeForecastReport({
        property: null,
      });

      const prepared = prepareReportForExport(report);

      expect(prepared.reportType, "Tipo preparado deve ser 'forecast'").toBe(
        "forecast",
      );
      expect(
        prepared.summary,
        "Relatório forecast não deve incluir propriedade summary",
      ).toBeUndefined();
      expect(
        prepared.rows.map((r) => r.Data),
        "Previsões diárias devem ser ordenadas por data crescente",
      ).toEqual(["2026-11-11", "2026-11-12"]);

      expect(
        prepared.rows[1],
        "Linha de previsão deve mapear todas as colunas e preservar vento nulo",
      ).toEqual({
        Data: "2026-11-12",
        Estação: "Estação Norte",
        Propriedade: "Todas",
        "Temp Min (°C)": 17,
        "Temp Max (°C)": 24.8,
        "Chuva (mm)": 12.4,
        "Probabilidade Chuva (%)": 80,
        "Vento Max (km/h)": null,
        "Código WMO": 63,
        Condição: "Chuva",
      });
    });

    it("prepara relatório alerts ordenando do mais recente para o mais antigo com desempate por id decrescente", () => {
      const report = makeAlertsReport({
        property: null,
        alerts: [
          {
            id: 10,
            station_id: 1,
            station_name: "Estação Norte",
            sensor_id: 6,
            sensor_type: "Pluviômetro",
            rule_name: "Chuva",
            condition: "> 20",
            threshold_value: 20,
            reading_value: 25,
            unit_of_measure: "mm",
            triggered_at: "2026-10-31T05:30:00.000Z",
            status: "acknowledged",
          },
          {
            id: 15,
            station_id: 2,
            station_name: "Estação Sul",
            sensor_id: 8,
            sensor_type: "Temperatura",
            rule_name: "Geada",
            condition: "< 2",
            threshold_value: 2,
            reading_value: 1,
            unit_of_measure: "°C",
            triggered_at: "2026-10-31T05:30:00.000Z",
            status: "pending",
          },
          {
            id: 5,
            station_id: 1,
            station_name: "Estação Norte",
            sensor_id: 6,
            sensor_type: "Pluviômetro",
            rule_name: "Chuva Moderada",
            condition: ">= 10",
            threshold_value: 10,
            reading_value: 12,
            unit_of_measure: "mm",
            triggered_at: "2026-10-29T10:00:00.000Z",
            status: "acknowledged",
          },
        ],
      });

      const prepared = prepareReportForExport(report);

      expect(
        prepared.rows.map((r) => r["ID Alerta"]),
        "Alertas devem ser ordenados por triggered_at decrescente e id decrescente",
      ).toEqual([15, 10, 5]);
      expect(
        prepared.rows[0]?.Status,
        "Status 'pending' deve ser traduzido para 'Pendente'",
      ).toBe("Pendente");
      expect(
        prepared.rows[1]?.Status,
        "Status 'acknowledged' deve ser traduzido para 'Reconhecido'",
      ).toBe("Reconhecido");
      expect(
        prepared.rows[0]?.Propriedade,
        "Propriedade ausente em alerts deve usar fallback 'Todas'",
      ).toBe("Todas");
    });
  });

  describe("5. Formatação CSV, JSON e nomenclatura de arquivo", () => {
    it.each([
      ["nulo", null, '""'],
      ["undefined", undefined, '""'],
      ["número decimal", 25.4, '"25.4"'],
      ["booleano", true, '"true"'],
      ["texto com aspas duplas", 'Estação "Central"', '"Estação ""Central"""'],
      [
        "texto com quebras CRLF, LF e CR",
        "Linha 1\r\nLinha 2\nLinha 3\rFim",
        '"Linha 1 Linha 2 Linha 3 Fim"',
      ],
    ] as const)(
      "escapa célula CSV para %s",
      (_scenario, inputCell, expectedCell) => {
        expect(
          escapeCsvCell(inputCell),
          `Célula CSV para ${_scenario} deve ser formatada conforme RFC 4180`,
        ).toBe(expectedCell);
      },
    );

    it.each([
      [
        "por estação (history em CSV)",
        extractReportFilters(makeHistoryReport()),
        "csv" as const,
        "relatorio-historico-estacao-1-2026-10-25_a_2026-11-01.csv",
      ],
      [
        "por propriedade (alerts em JSON)",
        extractReportFilters(makeAlertsReport()),
        "json" as const,
        "relatorio-alertas-propriedade-10-2026-10-25_a_2026-11-01.json",
      ],
      [
        "geral sem estação nem propriedade (history em CSV)",
        extractReportFilters(
          makeHistoryReport({ station: null, property: null }),
        ),
        "csv" as const,
        "relatorio-historico-geral-2026-10-25_a_2026-11-01.csv",
      ],
    ])(
      "gera nome de arquivo padronizado para escopo %s",
      (_scope, filters, format, expectedFilename) => {
        expect(
          buildExportFilename(filters, format),
          `Nome de arquivo para escopo ${_scope} deve seguir padrão relatorio-<tipo>-<escopo>-<inicio>_a_<fim>.<ext>`,
        ).toBe(expectedFilename);
      },
    );

    it("formata CSV com BOM UTF-8, delimitador ';' e quebras CRLF", () => {
      const prepared = prepareReportForExport(makeForecastReport());
      const csv = formatPreparedReportAsCsv(prepared);

      expect(
        csv.startsWith("\uFEFF"),
        "CSV deve iniciar com BOM UTF-8 para compatibilidade com planilhas",
      ).toBe(true);

      const lines = csv.slice(1).split("\r\n");
      expect(
        lines,
        "CSV deve conter cabeçalho + 2 linhas de dados",
      ).toHaveLength(3);
      expect(
        lines[0],
        "Cabeçalho CSV deve listar as 10 colunas de previsão entre aspas separadas por ';'",
      ).toBe(
        '"Data";"Estação";"Propriedade";"Temp Min (°C)";"Temp Max (°C)";"Chuva (mm)";"Probabilidade Chuva (%)";"Vento Max (km/h)";"Código WMO";"Condição"',
      );
      expect(
        lines[1],
        "Primeira linha de dados deve corresponder ao dia mais antigo (2026-11-11)",
      ).toBe(
        '"2026-11-11";"Estação Norte";"Fazenda Boa Vista";"18.1";"29.4";"0";"10";"14.5";"1";"Predominantemente limpo"',
      );
      expect(
        lines[2],
        'Segunda linha deve converter vento nulo em célula vazia ""',
      ).toBe(
        '"2026-11-12";"Estação Norte";"Fazenda Boa Vista";"17";"24.8";"12.4";"80";"";"63";"Chuva"',
      );
    });

    it("formata JSON estruturado de history preservando summary e filtros aplicados", () => {
      const preparedHistory = prepareReportForExport(makeHistoryReport());
      const parsedHistory = JSON.parse(
        formatPreparedReportAsJson(preparedHistory),
      ) as Record<string, unknown>;

      expect(
        parsedHistory.report_type,
        "JSON exportado deve preservar report_type 'history'",
      ).toBe("history");
      expect(
        parsedHistory.total_records,
        "JSON exportado deve informar total_records igual a 2",
      ).toBe(2);
      expect(
        parsedHistory.summary,
        "JSON de relatório histórico deve incluir resumo estatístico dos sensores",
      ).toHaveLength(1);
      expect(
        parsedHistory.filters,
        "JSON exportado deve manter objeto filters idêntico ao preparado",
      ).toEqual(preparedHistory.filters);
    });

    it("formata JSON estruturado de alerts omitindo a chave summary", () => {
      const preparedAlerts = prepareReportForExport(makeAlertsReport());
      const parsedAlerts = JSON.parse(
        formatPreparedReportAsJson(preparedAlerts),
      ) as Record<string, unknown>;

      expect(
        parsedAlerts.report_type,
        "JSON exportado deve preservar report_type 'alerts'",
      ).toBe("alerts");
      expect(
        "summary" in parsedAlerts,
        "JSON de alertas não deve serializar chave summary inexistente",
      ).toBe(false);
      expect(
        parsedAlerts.data,
        "JSON de alertas deve conter os 2 registros em data",
      ).toHaveLength(2);
    });
  });

  describe("6. Conjunto de dados vazio e casos limite na exportação (exportReport)", () => {
    it("rejeita input de exportação não-objeto com InvalidExportReportPayloadError", () => {
      const appError = captureError(
        () =>
          exportReport(null as unknown as Parameters<typeof exportReport>[0]),
        InvalidExportReportPayloadError,
      );

      expect(appError.statusCode, "Status HTTP deve ser 400").toBe(400);
      expect(
        appError.code,
        "Código de erro deve ser INVALID_EXPORT_REPORT",
      ).toBe("INVALID_EXPORT_REPORT");
      expect(
        appError.message,
        "Mensagem deve exigir objeto com 'report' e 'format'",
      ).toContain(
        "é obrigatório informar um objeto contendo 'report' e 'format'.",
      );
    });

    it("lança EmptyReportExportError (422) com datas no padrão brasileiro quando o relatório está vazio", () => {
      const emptyHistory = makeHistoryReport({
        total_readings: 0,
        summary: [],
        readings: [],
      });

      const emptyError = captureError(
        () =>
          exportReport({
            report: emptyHistory,
            format: "csv",
          }),
        EmptyReportExportError,
      );

      expect(emptyError.statusCode, "Status HTTP deve ser 422").toBe(422);
      expect(
        emptyError.code,
        "Código de erro deve ser EMPTY_REPORT_FOR_EXPORT",
      ).toBe("EMPTY_REPORT_FOR_EXPORT");
      expect(
        emptyError.message,
        "Mensagem deve trazer período em DD/MM/YYYY e nomes de estação e propriedade",
      ).toBe(
        "Não existem registros no relatório de histórico no período de 25/10/2026 a 01/11/2026 para estação 'Estação Norte' (ID 1) e propriedade 'Fazenda Boa Vista' (ID 10) para exportar.",
      );
    });

    it("formata mensagem de EmptyReportExportError para escopo geral e formatos alternativos de data", () => {
      const generalError = new EmptyReportExportError({
        report_type: "alerts",
        period: {
          from: "Nov 05 2026 00:00:00 GMT",
          to: "texto-sem-data",
        },
        station: null,
        property: null,
      });

      expect(
        generalError.message,
        "Erro sem estação/propriedade deve omitir escopo e preservar texto não parseável",
      ).toBe(
        "Não existem registros no relatório de alertas no período de 05/11/2026 a texto-sem-data para exportar.",
      );
    });

    it("permite exportar relatório vazio quando allowEmpty é true", () => {
      const emptyAlerts = makeAlertsReport({
        total_alerts: 0,
        alerts: [],
      });

      const result = exportReport({
        report: emptyAlerts,
        format: "csv",
        allowEmpty: true,
      });

      expect(result.isEmpty, "Indicador isEmpty deve permanecer true").toBe(
        true,
      );
      expect(result.totalRecords, "Quantidade totalRecords deve ser 0").toBe(0);
      expect(result.format, "Formato resolvido deve ser 'csv'").toBe("csv");
      expect(
        result.contentType,
        "Content-Type deve indicar text/csv em UTF-8",
      ).toBe("text/csv; charset=utf-8");
      expect(
        result.byteLength,
        "byteLength deve bater exatamente com o tamanho UTF-8 do CSV vazio",
      ).toBe(Buffer.byteLength(result.content, "utf8"));
      expect(
        result.content.slice(1).split("\r\n"),
        "CSV vazio com allowEmpty deve conter apenas a linha de cabeçalho",
      ).toHaveLength(1);
    });

    it("exporta relatório completo em JSON calculando byteLength UTF-8 exato", () => {
      const result = exportReport({
        report: makeAlertsReport(),
        format: "application/json",
      });

      expect(
        result.format,
        "Alias application/json deve resolver para 'json'",
      ).toBe("json");
      expect(result.extension, "Extensão retornada deve ser 'json'").toBe(
        "json",
      );
      expect(
        result.contentType,
        "Content-Type deve ser application/json; charset=utf-8",
      ).toBe("application/json; charset=utf-8");
      expect(
        result.filename,
        "Nome do arquivo deve refletir tipo alerts, propriedade 10 e período",
      ).toBe("relatorio-alertas-propriedade-10-2026-10-25_a_2026-11-01.json");
      expect(result.totalRecords, "Total de registros deve ser 2").toBe(2);
      expect(result.isEmpty, "Relatório com alertas não pode ser vazio").toBe(
        false,
      );
      expect(
        result.byteLength,
        "byteLength deve considerar bytes UTF-8 de caracteres acentuados",
      ).toBe(Buffer.byteLength(result.content, "utf8"));
      expect(
        result.generatedAt,
        "generatedAt retornado deve preservar timestamp original do relatório",
      ).toBe(FIXED_GENERATED_AT);
    });
  });

  describe("7. Serviço de exportação (ExportReportService)", () => {
    it("exporta relatório já gerado via exportFromReport", () => {
      const service = new ExportReportService();
      const result = service.exportFromReport({
        report: makeHistoryReport(),
        format: "csv",
      });

      expect(
        result.format,
        "Formato exportado pelo service deve ser 'csv'",
      ).toBe("csv");
      expect(result.totalRecords, "Total exportado deve ser 2").toBe(2);
      expect(
        result.filename,
        "Nome de arquivo gerado pelo service deve seguir padrão da regra",
      ).toBe("relatorio-historico-estacao-1-2026-10-25_a_2026-11-01.csv");
    });

    it("rejeita generateAndExport quando GenerateReportService não foi injetado", async () => {
      const service = new ExportReportService();

      await expect(
        service.generateAndExport({
          type: "history",
          format: "csv",
        }),
        "Deve rejeitar chamada automática sem GenerateReportService configurado",
      ).rejects.toThrow(
        "serviço de geração de relatórios não configurado para geração automática.",
      );
    });

    it("gera e exporta relatório em memória via generateAndExport sem depender de infraestrutura", async () => {
      const repository = new InMemoryReportRepository();
      repository.stations = [
        {
          id: 1,
          name: "Estação Norte",
          latitude: -23.19,
          longitude: -45.88,
          property_id: 10,
          property_name: "Fazenda Boa Vista",
        },
      ];
      repository.readings = [
        {
          id: 1,
          sensor_id: 101,
          sensor_type_id: 1,
          sensor_type: "Temperatura",
          unit_of_measure: "°C",
          value: 23.4,
          unix_time: Math.floor(
            new Date("2026-10-28T10:00:00.000Z").getTime() / 1000,
          ),
          data_consistent: true,
        },
      ];

      const generateService = new GenerateReportService(
        repository,
        () => new Date(FIXED_GENERATED_AT),
      );
      const exportService = new ExportReportService(generateService);

      const exported = await exportService.generateAndExport({
        type: "historico",
        station_id: 1,
        from: "2026-10-25T00:00:00.000Z",
        to: "2026-11-01T00:00:00.000Z",
        format: "json",
      });

      expect(exported.format, "Formato gerado em cadeia deve ser 'json'").toBe(
        "json",
      );
      expect(exported.totalRecords, "Deve exportar exatamente 1 leitura").toBe(
        1,
      );
      expect(
        exported.filters.station,
        "Filtros retornados devem preservar metadados da estação consultada",
      ).toEqual({
        id: 1,
        name: "Estação Norte",
      });
      expect(
        exported.filters.property,
        "Filtros retornados devem preservar metadados da propriedade vinculada",
      ).toEqual({
        id: 10,
        name: "Fazenda Boa Vista",
      });
    });
  });
});
