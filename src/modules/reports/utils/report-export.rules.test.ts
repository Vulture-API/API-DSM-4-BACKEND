import { describe, expect, it } from "vitest";

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
        expect(
          () => resolveExportFormat(invalidInput),
          "Entrada não textual deve lançar InvalidExportFormatError",
        ).toThrow(InvalidExportFormatError);

        try {
          resolveExportFormat(invalidInput);
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidExportFormatError);
          const appError = error as InvalidExportFormatError;
          expect(appError.statusCode, "Status HTTP deve ser 400").toBe(400);
          expect(
            appError.code,
            "Código de erro deve ser INVALID_EXPORT_FORMAT",
          ).toBe("INVALID_EXPORT_FORMAT");
          expect(
            appError.message,
            "Mensagem deve informar ausência de formato válido",
          ).toContain("Nenhum formato de exportação foi informado.");
        }
      },
    );

    it.each(["", "   ", "pdf", "xlsx", "xml", "text/plain"])(
      "rejeita formato não suportado ('%s') informando os formatos permitidos",
      (unsupportedFormat) => {
        expect(() => resolveExportFormat(unsupportedFormat)).toThrow(
          InvalidExportFormatError,
        );

        try {
          resolveExportFormat(unsupportedFormat);
        } catch (error) {
          const appError = error as InvalidExportFormatError;
          expect(appError.statusCode).toBe(400);
          expect(appError.code).toBe("INVALID_EXPORT_FORMAT");
          expect(appError.message).toContain(
            "Os formatos permitidos são: 'csv' e 'json'.",
          );
        }
      },
    );
  });

  describe("2. Validação estrutural do payload de relatório (validateReportForExport)", () => {
    it.each([[null], [undefined], ["history"], [42], [[1, 2]]])(
      "rejeita payload que não é objeto plano (%j)",
      (invalidPayload) => {
        expect(() => validateReportForExport(invalidPayload)).toThrow(
          InvalidExportReportPayloadError,
        );

        try {
          validateReportForExport(invalidPayload);
        } catch (error) {
          const appError = error as InvalidExportReportPayloadError;
          expect(appError.statusCode).toBe(400);
          expect(appError.code).toBe("INVALID_EXPORT_REPORT");
          expect(appError.message).toContain(
            "é obrigatório fornecer um objeto de relatório válido.",
          );
        }
      },
    );

    it("rejeita report_type inválido ou ausente", () => {
      const invalidReport = {
        ...makeHistoryReport(),
        report_type: "summary",
      };

      expect(() => validateReportForExport(invalidReport)).toThrow(
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

        expect(() => validateReportForExport(invalidReport)).toThrow(
          "o campo 'generated_at' deve ser uma data válida.",
        );
      },
    );

    it.each([[null], [undefined], ["2026-10-25"], [["2026-10-25"]]])(
      "rejeita period ausente ou não estruturado (%j)",
      (invalidPeriod) => {
        const invalidReport = {
          ...makeHistoryReport(),
          period: invalidPeriod,
        };

        expect(() => validateReportForExport(invalidReport)).toThrow(
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

        expect(() => validateReportForExport(invalidReport)).toThrow(
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

      expect(() => validateReportForExport(invalidReport)).toThrow(
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

      expect(() => validateReportForExport(invalidHistory)).toThrow(
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

        expect(() => validateReportForExport(invalidForecast)).toThrow(
          "o relatório de previsões deve conter os metadados válidos da estação em 'station' (id e name).",
        );
      },
    );

    it("rejeita relatório forecast sem array válido em days", () => {
      const invalidForecast = {
        ...makeForecastReport(),
        days: "invalido",
      };

      expect(() => validateReportForExport(invalidForecast)).toThrow(
        "o relatório de previsões deve conter uma lista válida em 'days'.",
      );
    });

    it("rejeita relatório alerts sem array válido em alerts", () => {
      const invalidAlerts = {
        ...makeAlertsReport(),
        alerts: {},
      };

      expect(() => validateReportForExport(invalidAlerts)).toThrow(
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

      expect(prepared.reportType).toBe("history");
      expect(prepared.totalRecords).toBe(3);
      expect(prepared.isEmpty).toBe(false);
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

      expect(prepared.rows[0]?.["Estação"]).toBe("Todas");
      expect(prepared.rows[0]?.["Propriedade"]).toBe("Todas");
      expect(prepared.summary).toEqual([]);
    });

    it("prepara relatório forecast ordenando dias cronologicamente e preservando valores nulos", () => {
      const report = makeForecastReport({
        property: null,
      });

      const prepared = prepareReportForExport(report);

      expect(prepared.reportType).toBe("forecast");
      expect(prepared.summary).toBeUndefined();
      expect(
        prepared.rows.map((r) => r.Data),
        "Previsões diárias devem ser ordenadas por data crescente",
      ).toEqual(["2026-11-11", "2026-11-12"]);

      expect(prepared.rows[1]).toEqual({
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
      expect(prepared.rows[0]?.Status).toBe("Pendente");
      expect(prepared.rows[1]?.Status).toBe("Reconhecido");
      expect(prepared.rows[0]?.Propriedade).toBe("Todas");
    });
  });

  describe("5. Formatação CSV, JSON e nomenclatura de arquivo", () => {
    it("escapa células CSV tratando nulos, aspas duplas e quebras de linha", () => {
      expect(escapeCsvCell(null)).toBe('""');
      expect(escapeCsvCell(undefined)).toBe('""');
      expect(escapeCsvCell(25.4)).toBe('"25.4"');
      expect(escapeCsvCell(true)).toBe('"true"');
      expect(escapeCsvCell('Estação "Central"')).toBe('"Estação ""Central"""');
      expect(escapeCsvCell("Linha 1\r\nLinha 2\nLinha 3\rFim")).toBe(
        '"Linha 1 Linha 2 Linha 3 Fim"',
      );
    });

    it("gera nomes de arquivo padronizados conforme tipo, escopo e extensão", () => {
      const stationFilters = extractReportFilters(makeHistoryReport());
      expect(buildExportFilename(stationFilters, "csv")).toBe(
        "relatorio-historico-estacao-1-2026-10-25_a_2026-11-01.csv",
      );

      const propertyOnlyFilters = extractReportFilters(makeAlertsReport());
      expect(buildExportFilename(propertyOnlyFilters, "json")).toBe(
        "relatorio-alertas-propriedade-10-2026-10-25_a_2026-11-01.json",
      );

      const generalFilters = extractReportFilters(
        makeHistoryReport({ station: null, property: null }),
      );
      expect(buildExportFilename(generalFilters, "csv")).toBe(
        "relatorio-historico-geral-2026-10-25_a_2026-11-01.csv",
      );
    });

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
      expect(lines[0]).toBe(
        '"Data";"Estação";"Propriedade";"Temp Min (°C)";"Temp Max (°C)";"Chuva (mm)";"Probabilidade Chuva (%)";"Vento Max (km/h)";"Código WMO";"Condição"',
      );
      expect(lines[1]).toBe(
        '"2026-11-11";"Estação Norte";"Fazenda Boa Vista";"18.1";"29.4";"0";"10";"14.5";"1";"Predominantemente limpo"',
      );
      expect(lines[2]).toBe(
        '"2026-11-12";"Estação Norte";"Fazenda Boa Vista";"17";"24.8";"12.4";"80";"";"63";"Chuva"',
      );
    });

    it("formata JSON estruturado preservando summary no histórico e omitindo nos demais tipos", () => {
      const preparedHistory = prepareReportForExport(makeHistoryReport());
      const parsedHistory = JSON.parse(
        formatPreparedReportAsJson(preparedHistory),
      ) as Record<string, unknown>;

      expect(parsedHistory.report_type).toBe("history");
      expect(parsedHistory.total_records).toBe(2);
      expect(parsedHistory.summary).toHaveLength(1);
      expect(parsedHistory.filters).toEqual(preparedHistory.filters);

      const preparedAlerts = prepareReportForExport(makeAlertsReport());
      const parsedAlerts = JSON.parse(
        formatPreparedReportAsJson(preparedAlerts),
      ) as Record<string, unknown>;

      expect(parsedAlerts.report_type).toBe("alerts");
      expect("summary" in parsedAlerts).toBe(false);
      expect(parsedAlerts.data).toHaveLength(2);
    });
  });

  describe("6. Conjunto de dados vazio e casos limite na exportação (exportReport)", () => {
    it("rejeita input de exportação não-objeto com InvalidExportReportPayloadError", () => {
      expect(() =>
        exportReport(null as unknown as Parameters<typeof exportReport>[0]),
      ).toThrow(
        "é obrigatório informar um objeto contendo 'report' e 'format'.",
      );
    });

    it("lança EmptyReportExportError (422) com datas no padrão brasileiro quando o relatório está vazio", () => {
      const emptyHistory = makeHistoryReport({
        total_readings: 0,
        summary: [],
        readings: [],
      });

      expect(() =>
        exportReport({
          report: emptyHistory,
          format: "csv",
        }),
      ).toThrow(EmptyReportExportError);

      try {
        exportReport({
          report: emptyHistory,
          format: "csv",
        });
      } catch (error) {
        const emptyError = error as EmptyReportExportError;
        expect(emptyError.statusCode).toBe(422);
        expect(emptyError.code).toBe("EMPTY_REPORT_FOR_EXPORT");
        expect(emptyError.message).toBe(
          "Não existem registros no relatório de histórico no período de 25/10/2026 a 01/11/2026 para estação 'Estação Norte' (ID 1) e propriedade 'Fazenda Boa Vista' (ID 10) para exportar.",
        );
      }
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

      expect(generalError.message).toBe(
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

      expect(result.isEmpty).toBe(true);
      expect(result.totalRecords).toBe(0);
      expect(result.format).toBe("csv");
      expect(result.contentType).toBe("text/csv; charset=utf-8");
      expect(result.byteLength).toBe(Buffer.byteLength(result.content, "utf8"));
      expect(result.content.slice(1).split("\r\n")).toHaveLength(1);
    });

    it("exporta relatório completo em JSON calculando byteLength UTF-8 exato", () => {
      const result = exportReport({
        report: makeAlertsReport(),
        format: "application/json",
      });

      expect(result.format).toBe("json");
      expect(result.extension).toBe("json");
      expect(result.contentType).toBe("application/json; charset=utf-8");
      expect(result.filename).toBe(
        "relatorio-alertas-propriedade-10-2026-10-25_a_2026-11-01.json",
      );
      expect(result.totalRecords).toBe(2);
      expect(result.isEmpty).toBe(false);
      expect(result.byteLength).toBe(Buffer.byteLength(result.content, "utf8"));
      expect(result.generatedAt).toBe(FIXED_GENERATED_AT);
    });
  });

  describe("7. Serviço de exportação (ExportReportService)", () => {
    it("exporta relatório já gerado via exportFromReport", () => {
      const service = new ExportReportService();
      const result = service.exportFromReport({
        report: makeHistoryReport(),
        format: "csv",
      });

      expect(result.format).toBe("csv");
      expect(result.totalRecords).toBe(2);
      expect(result.filename).toBe(
        "relatorio-historico-estacao-1-2026-10-25_a_2026-11-01.csv",
      );
    });

    it("rejeita generateAndExport quando GenerateReportService não foi injetado", async () => {
      const service = new ExportReportService();

      await expect(
        service.generateAndExport({
          type: "history",
          format: "csv",
        }),
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

      expect(exported.format).toBe("json");
      expect(exported.totalRecords).toBe(1);
      expect(exported.filters.station).toEqual({
        id: 1,
        name: "Estação Norte",
      });
      expect(exported.filters.property).toEqual({
        id: 10,
        name: "Fazenda Boa Vista",
      });
    });
  });
});
